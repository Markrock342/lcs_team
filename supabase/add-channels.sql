-- Discord-style channels migration
-- รันใน Supabase SQL Editor (โปรเจกต์ที่มี messages อยู่แล้ว)

-- 1. สร้างตาราง channels
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. เพิ่ม channel_id ใน messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE CASCADE;

-- 3. สร้างแชannel เริ่มต้น
INSERT INTO channels (name, description) VALUES
  ('general', 'แชททั่วไปของทีม'),
  ('dev', 'คุยงาน dev / code'),
  ('design', 'UI/UX และ frontend'),
  ('random', 'คุยเล่น ไม่เกี่ยวงาน')
ON CONFLICT (name) DO NOTHING;

-- 4. ย้ายข้อความเก่าไป #general
UPDATE messages
SET channel_id = (SELECT id FROM channels WHERE name = 'general' LIMIT 1)
WHERE channel_id IS NULL;

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);

-- 6. RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view channels" ON channels;
CREATE POLICY "Team can view channels" ON channels FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can create channels" ON channels;
CREATE POLICY "Team can create channels" ON channels FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Team can update channels" ON channels;
CREATE POLICY "Team can update channels" ON channels FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can delete channels" ON channels;
CREATE POLICY "Team can delete channels" ON channels FOR DELETE TO authenticated USING (true);

-- 7. Realtime (ข้าม error ถ้า add แล้ว)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE channels;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
