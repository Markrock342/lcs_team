-- ฟีเจอร์แชท: reply, ลบ/ยกเลิก, read receipts
-- รันใน Supabase SQL Editor

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS message_reads (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_user ON message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view message reads" ON message_reads;
CREATE POLICY "Team can view message reads"
  ON message_reads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can mark messages read" ON message_reads;
CREATE POLICY "Users can mark messages read"
  ON message_reads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own message reads" ON message_reads;
CREATE POLICY "Users can update own message reads"
  ON message_reads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own messages" ON messages;
CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE TO authenticated
  USING (
    auth.uid() = sender_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    auth.uid() = sender_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
