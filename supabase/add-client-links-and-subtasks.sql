-- เพิ่มลิงก์ลูกค้า + งานย่อย (subtasks)
-- รันใน Supabase SQL Editor

-- ลิงก์โปรเจกต์
ALTER TABLE clients ADD COLUMN IF NOT EXISTS repo_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS supabase_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS figma_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS staging_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS production_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS docs_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS drive_url TEXT;

-- งานย่อย (parent = งานใหญ่)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
