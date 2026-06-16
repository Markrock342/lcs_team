-- Limit Code: ฟีเจอร์ครบชุด + PWA Push
-- รันใน Supabase SQL Editor หลัง schema หลัก

-- ========== ACTIVITY LOG ==========
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_title TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

-- ========== NOTIFICATIONS (in-app) ==========
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- ========== PUSH SUBSCRIPTIONS ==========
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- ========== INVOICES ==========
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partial','paid','overdue')),
  due_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== TIME TRACKING ==========
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);

-- ========== TASK TEMPLATES ==========
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_template_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  suggested_role TEXT CHECK (suggested_role IN ('pm','backend','design')),
  duration_days INTEGER DEFAULT 3,
  sort_order INTEGER DEFAULT 0
);

-- ========== CLIENT FILES ==========
CREATE TABLE IF NOT EXISTS client_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== CLIENT PORTAL ==========
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_token UUID DEFAULT uuid_generate_v4();
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT FALSE;

-- ========== USER PREFERENCES ==========
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark','light'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT TRUE;

-- ========== MESSAGE MENTIONS ==========
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentioned_ids UUID[] DEFAULT '{}';

-- ========== TRIGGERS ==========
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========== RLS ==========
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team view activity" ON activity_logs;
CREATE POLICY "Team view activity" ON activity_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Team insert activity" ON activity_logs;
CREATE POLICY "Team insert activity" ON activity_logs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Own notifications" ON notifications;
CREATE POLICY "Own notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Insert notifications" ON notifications;
CREATE POLICY "Insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Update own notifications" ON notifications;
CREATE POLICY "Update own notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own push subs" ON push_subscriptions;
CREATE POLICY "Own push subs" ON push_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Team invoices" ON invoices;
CREATE POLICY "Team invoices" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Team payments" ON invoice_payments;
CREATE POLICY "Team payments" ON invoice_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Team time entries" ON time_entries;
CREATE POLICY "Team time entries" ON time_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Team templates" ON task_templates;
CREATE POLICY "Team templates" ON task_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Team template items" ON task_template_items;
CREATE POLICY "Team template items" ON task_template_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Team client files" ON client_files;
CREATE POLICY "Team client files" ON client_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== PORTAL RPC (public read via token) ==========
CREATE OR REPLACE FUNCTION get_portal_data(token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  cid UUID;
BEGIN
  SELECT id INTO cid FROM clients WHERE portal_token = token AND portal_enabled = TRUE;
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'client', (SELECT row_to_json(c) FROM (
      SELECT name, company, project_type, status, description FROM clients WHERE id = cid
    ) c),
    'tasks', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT title, status, progress, start_date, due_date, duration_days
      FROM tasks WHERE client_id = cid AND parent_id IS NULL
      ORDER BY start_date NULLS LAST
    ) t),
    'invoices', (SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json) FROM (
      SELECT title, total_amount, status, due_date FROM invoices WHERE client_id = cid
    ) i)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_data(UUID) TO anon, authenticated;

-- ========== SEED DEFAULT TEMPLATES ==========
INSERT INTO task_templates (name, description, project_type) VALUES
  ('แอpp + Admin', 'เทมเพลตมาตรฐานแอพมือถือพร้อมระบบหลังบ้าน', 'mobile_app'),
  ('เว็บไซต์ + CMS', 'เว็บไซต์พร้อมระบบจัดการเนื้อหา', 'website'),
  ('Web App Full Stack', 'Web application ครบวงจร', 'web_app')
ON CONFLICT DO NOTHING;

-- Seed template items (only if templates exist and items empty)
DO $$
DECLARE
  tid UUID;
BEGIN
  SELECT id INTO tid FROM task_templates WHERE name = 'แอpp + Admin' LIMIT 1;
  IF tid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM task_template_items WHERE template_id = tid) THEN
    INSERT INTO task_template_items (template_id, title, suggested_role, duration_days, sort_order) VALUES
      (tid, 'เก็บ requirement & วางแผน', 'pm', 3, 1),
      (tid, 'UI/UX Design', 'design', 7, 2),
      (tid, 'API Backend', 'backend', 14, 3),
      (tid, 'Mobile App Frontend', 'design', 14, 4),
      (tid, 'Admin Dashboard', 'design', 7, 5),
      (tid, 'Testing & Deploy', 'backend', 5, 6);
  END IF;
END $$;

-- Realtime notifications
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
