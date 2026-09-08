-- Sales prospects, contact log, saved views, inbox actions
-- รันใน Supabase SQL Editor หลัง add-sales-department.sql (รันซ้ำได้)

CREATE TABLE IF NOT EXISTS sales_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  province TEXT,
  source TEXT NOT NULL DEFAULT 'excel',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'assigned', 'contacted', 'interested', 'not_interested', 'converted')),
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  next_follow_up DATE,
  notes TEXT,
  deal_id UUID REFERENCES sales_deals(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  import_batch_id TEXT,
  external_key TEXT,
  extra JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_prospects_external_key
  ON sales_prospects(external_key)
  WHERE external_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_prospects_status ON sales_prospects(status);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_owner ON sales_prospects(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_follow_up ON sales_prospects(next_follow_up);

DROP TRIGGER IF EXISTS sales_prospects_updated_at ON sales_prospects;
CREATE TRIGGER sales_prospects_updated_at BEFORE UPDATE ON sales_prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sales_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view sales prospects" ON sales_prospects;
CREATE POLICY "Team can view sales prospects" ON sales_prospects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can insert sales prospects" ON sales_prospects;
CREATE POLICY "Team can insert sales prospects" ON sales_prospects
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Team can update sales prospects" ON sales_prospects;
CREATE POLICY "Team can update sales prospects" ON sales_prospects
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can delete sales prospects" ON sales_prospects;
CREATE POLICY "Team can delete sales prospects" ON sales_prospects
  FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS sales_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES sales_prospects(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES sales_deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note'
    CHECK (type IN ('call', 'email_draft', 'note', 'follow_up')),
  outcome TEXT
    CHECK (outcome IS NULL OR outcome IN (
      'reached', 'no_answer', 'voicemail', 'emailed', 'interested', 'not_interested', 'callback'
    )),
  content TEXT,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_interactions_prospect ON sales_interactions(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_interactions_deal ON sales_interactions(deal_id, created_at DESC);

ALTER TABLE sales_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view sales interactions" ON sales_interactions;
CREATE POLICY "Team can view sales interactions" ON sales_interactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can insert sales interactions" ON sales_interactions;
CREATE POLICY "Team can insert sales interactions" ON sales_interactions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Team can update sales interactions" ON sales_interactions;
CREATE POLICY "Team can update sales interactions" ON sales_interactions
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can delete sales interactions" ON sales_interactions;
CREATE POLICY "Team can delete sales interactions" ON sales_interactions
  FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  page TEXT NOT NULL CHECK (page IN ('tasks', 'clients', 'sales', 'finance')),
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_user ON saved_views(user_id, page);

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved views" ON saved_views;
CREATE POLICY "Users manage own saved views" ON saved_views
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_kind TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_payload JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sales_prospects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sales_interactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE saved_views TO authenticated;
NOTIFY pgrst, 'reload schema';
