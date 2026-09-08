-- แชทแบบ Slack/Discord: DM, จุดยังไม่อ่าน, เธรด, ปักหมุด, แก้ข้อความ
-- รันใน Supabase SQL Editor (รันซ้ำได้)

ALTER TABLE channels ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'channel';
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_kind_check;
ALTER TABLE channels ADD CONSTRAINT channels_kind_check
  CHECK (kind IN ('channel', 'dm'));
ALTER TABLE channels ADD COLUMN IF NOT EXISTS dm_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_dm_key
  ON channels(dm_key)
  WHERE dm_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

CREATE TABLE IF NOT EXISTS channel_reads (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES profiles(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON messages(channel_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_access_channel(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = cid
      AND (
        COALESCE(c.kind, 'channel') <> 'dm'
        OR c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.channel_members m
          WHERE m.channel_id = cid
            AND m.user_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid) TO authenticated;

DROP POLICY IF EXISTS "Team can view channels" ON channels;
CREATE POLICY "Team can view channels" ON channels
  FOR SELECT TO authenticated
  USING (
    COALESCE(kind, 'channel') <> 'dm'
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.channel_members m
      WHERE m.channel_id = channels.id
        AND m.user_id = auth.uid()
    )
  );

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View channel members" ON channel_members;
CREATE POLICY "View channel members" ON channel_members
  FOR SELECT TO authenticated
  USING (public.can_access_channel(channel_id));
DROP POLICY IF EXISTS "Insert channel members" ON channel_members;
CREATE POLICY "Insert channel members" ON channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id AND c.created_by = auth.uid()
    )
  );

ALTER TABLE channel_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own channel reads" ON channel_reads;
CREATE POLICY "Own channel reads" ON channel_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Team can view messages" ON messages;
CREATE POLICY "Team can view messages" ON messages
  FOR SELECT TO authenticated
  USING (public.can_access_channel(channel_id));

DROP POLICY IF EXISTS "Team can send messages" ON messages;
CREATE POLICY "Team can send messages" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.can_access_channel(channel_id));

DROP POLICY IF EXISTS "Users can update own messages" ON messages;
CREATE POLICY "Users can update own messages" ON messages
  FOR UPDATE TO authenticated
  USING (public.can_access_channel(channel_id))
  WITH CHECK (public.can_access_channel(channel_id));

CREATE OR REPLACE FUNCTION public.messages_restrict_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF auth.uid() = OLD.sender_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['pinned_at', 'pinned_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['pinned_at', 'pinned_by'])
  THEN
    RAISE EXCEPTION 'allowed to pin only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_restrict_update ON messages;
CREATE TRIGGER messages_restrict_update
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.messages_restrict_update();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE channel_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE channel_reads TO authenticated;

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team reactions" ON message_reactions;
CREATE POLICY "Team reactions" ON message_reactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE message_reactions TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE channel_reads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
