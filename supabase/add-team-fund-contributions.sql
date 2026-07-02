-- เก็บเงินกองกลางทีม
-- รันใน Supabase SQL Editor (รันซ้ำได้)

CREATE TABLE IF NOT EXISTS team_fund_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contributor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL DEFAULT 'เก็บเงินกองกลาง',
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  slip_url TEXT,
  slip_file_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_fund_contributions_paid_at
  ON team_fund_contributions(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_fund_contributions_contributor
  ON team_fund_contributions(contributor_id);

DROP TRIGGER IF EXISTS team_fund_contributions_updated_at
  ON team_fund_contributions;
CREATE TRIGGER team_fund_contributions_updated_at
  BEFORE UPDATE ON team_fund_contributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE team_fund_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team fund contributions" ON team_fund_contributions;
CREATE POLICY "Team fund contributions"
  ON team_fund_contributions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
