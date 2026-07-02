-- Simple Accounting Ledger
-- รันใน Supabase SQL Editor (รันซ้ำได้)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- เก็บเงินกองกลางทีม (ใช้เป็น source หนึ่งของ ledger)
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

-- หมวดหมู่บัญชี
CREATE TABLE IF NOT EXISTS accounting_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS accounting_categories_updated_at
  ON accounting_categories;
CREATE TRIGGER accounting_categories_updated_at
  BEFORE UPDATE ON accounting_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team accounting categories" ON accounting_categories;
CREATE POLICY "Team accounting categories"
  ON accounting_categories
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO accounting_categories (slug, name, type, is_system, sort_order)
VALUES
  ('client_payment', 'รับเงินลูกค้า', 'income', TRUE, 10),
  ('team_fund', 'เงินกองกลาง', 'income', TRUE, 20),
  ('other_income', 'รายรับอื่นๆ', 'income', FALSE, 90),
  ('team_payout', 'จ่ายเพื่อนในทีม', 'expense', TRUE, 110),
  ('software', 'ซอฟต์แวร์ / Subscription', 'expense', FALSE, 120),
  ('equipment', 'อุปกรณ์', 'expense', FALSE, 130),
  ('ads', 'โฆษณา / การตลาด', 'expense', FALSE, 140),
  ('travel', 'เดินทาง', 'expense', FALSE, 150),
  ('other_expense', 'รายจ่ายอื่นๆ', 'expense', FALSE, 190)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  is_system = EXCLUDED.is_system,
  sort_order = EXCLUDED.sort_order;

-- สมุดบัญชีกลาง
CREATE TABLE IF NOT EXISTS accounting_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id UUID REFERENCES accounting_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  member_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  source_type TEXT,
  source_id UUID,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  slip_url TEXT,
  slip_file_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_transactions_date
  ON accounting_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_type
  ON accounting_transactions(type);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_category
  ON accounting_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_member
  ON accounting_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_client
  ON accounting_transactions(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_transactions_source
  ON accounting_transactions(source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

DROP TRIGGER IF EXISTS accounting_transactions_updated_at
  ON accounting_transactions;
CREATE TRIGGER accounting_transactions_updated_at
  BEFORE UPDATE ON accounting_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team accounting transactions" ON accounting_transactions;
CREATE POLICY "Team accounting transactions"
  ON accounting_transactions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Backfill: รับเงินลูกค้า
INSERT INTO accounting_transactions (
  type,
  amount,
  transaction_date,
  category_id,
  description,
  client_id,
  source_type,
  source_id,
  vat_amount,
  notes,
  created_at
)
SELECT
  'income',
  p.amount,
  p.paid_at,
  (SELECT id FROM accounting_categories WHERE slug = 'client_payment'),
  COALESCE(i.title, 'รับชำระจากลูกค้า'),
  i.client_id,
  'invoice_payment',
  p.id,
  CASE
    WHEN COALESCE(i.total_amount, 0) > 0
      THEN ROUND((COALESCE(i.vat_amount, 0) * (p.amount / i.total_amount))::numeric, 2)
    ELSE 0
  END,
  p.note,
  p.created_at
FROM invoice_payments p
LEFT JOIN invoices i ON i.id = p.invoice_id
ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
DO UPDATE SET
  amount = EXCLUDED.amount,
  transaction_date = EXCLUDED.transaction_date,
  description = EXCLUDED.description,
  client_id = EXCLUDED.client_id,
  vat_amount = EXCLUDED.vat_amount,
  notes = EXCLUDED.notes;

-- Backfill: จ่ายเพื่อน
INSERT INTO accounting_transactions (
  type,
  amount,
  transaction_date,
  category_id,
  description,
  member_id,
  source_type,
  source_id,
  slip_url,
  slip_file_name,
  notes,
  created_by,
  created_at
)
SELECT
  'expense',
  p.amount,
  p.paid_at,
  (SELECT id FROM accounting_categories WHERE slug = 'team_payout'),
  p.description,
  p.payee_id,
  'team_payout',
  p.id,
  p.slip_url,
  p.slip_file_name,
  p.notes,
  p.created_by,
  p.created_at
FROM team_payouts p
ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
DO UPDATE SET
  amount = EXCLUDED.amount,
  transaction_date = EXCLUDED.transaction_date,
  description = EXCLUDED.description,
  member_id = EXCLUDED.member_id,
  slip_url = EXCLUDED.slip_url,
  slip_file_name = EXCLUDED.slip_file_name,
  notes = EXCLUDED.notes;

-- Backfill: กองกลาง
INSERT INTO accounting_transactions (
  type,
  amount,
  transaction_date,
  category_id,
  description,
  member_id,
  source_type,
  source_id,
  slip_url,
  slip_file_name,
  notes,
  created_by,
  created_at
)
SELECT
  'income',
  c.amount,
  c.paid_at,
  (SELECT id FROM accounting_categories WHERE slug = 'team_fund'),
  c.description,
  c.contributor_id,
  'team_fund_contribution',
  c.id,
  c.slip_url,
  c.slip_file_name,
  c.notes,
  c.created_by,
  c.created_at
FROM team_fund_contributions c
ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
DO UPDATE SET
  amount = EXCLUDED.amount,
  transaction_date = EXCLUDED.transaction_date,
  description = EXCLUDED.description,
  member_id = EXCLUDED.member_id,
  slip_url = EXCLUDED.slip_url,
  slip_file_name = EXCLUDED.slip_file_name,
  notes = EXCLUDED.notes;
