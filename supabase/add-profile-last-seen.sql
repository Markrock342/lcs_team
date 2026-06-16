-- เพิ่ม last_seen_at สำหรับ online/offline
-- รันใน Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

UPDATE profiles SET last_seen_at = NOW() WHERE last_seen_at IS NULL;

-- เปิด Realtime สำหรับ profiles (ถ้ายังไม่เปิด)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
