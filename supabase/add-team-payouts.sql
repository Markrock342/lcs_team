-- จ่ายเงินทีม + บัญชีสมาชิก
-- รันใน Supabase SQL Editor (รันซ้ำได้)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_name TEXT;

CREATE TABLE IF NOT EXISTS team_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  slip_url TEXT,
  slip_file_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_payouts_paid_at ON team_payouts(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_payouts_payee ON team_payouts(payee_id);
CREATE INDEX IF NOT EXISTS idx_team_payouts_payer ON team_payouts(payer_id);

DROP TRIGGER IF EXISTS team_payouts_updated_at ON team_payouts;
CREATE TRIGGER team_payouts_updated_at BEFORE UPDATE ON team_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE team_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team payouts" ON team_payouts;
CREATE POLICY "Team payouts" ON team_payouts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
