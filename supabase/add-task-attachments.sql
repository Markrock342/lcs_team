-- Task attachments: แนบไฟล์หลายไฟล์ต่อหนึ่งงาน (งานใหญ่/งานย่อย)
-- รันใน Supabase SQL Editor (รันซ้ำได้)

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task
  ON task_attachments(task_id, created_at DESC);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team task attachments" ON task_attachments;
CREATE POLICY "Team task attachments" ON task_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
