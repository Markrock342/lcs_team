-- แผนกขาย: role `sale` + ตารางดีล
-- รันใน Supabase SQL Editor (รันซ้ำได้)

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pm', 'backend', 'design', 'sale', 'guest'));

CREATE TABLE IF NOT EXISTS sales_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  company TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  value DECIMAL(12,2),
  stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead', 'talking', 'quoted', 'won', 'lost')),
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  next_follow_up DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_deals_stage ON sales_deals(stage);
CREATE INDEX IF NOT EXISTS idx_sales_deals_owner ON sales_deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_deals_client ON sales_deals(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_deals_follow_up ON sales_deals(next_follow_up);

DROP TRIGGER IF EXISTS sales_deals_updated_at ON sales_deals;
CREATE TRIGGER sales_deals_updated_at BEFORE UPDATE ON sales_deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sales_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view sales deals" ON sales_deals;
CREATE POLICY "Team can view sales deals" ON sales_deals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can insert sales deals" ON sales_deals;
CREATE POLICY "Team can insert sales deals" ON sales_deals
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Team can update sales deals" ON sales_deals;
CREATE POLICY "Team can update sales deals" ON sales_deals
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can delete sales deals" ON sales_deals;
CREATE POLICY "Team can delete sales deals" ON sales_deals
  FOR DELETE TO authenticated USING (true);

INSERT INTO channels (name, description) VALUES
  ('sale', 'คุยงานขาย ลีด และลูกค้า')
ON CONFLICT (name) DO NOTHING;
