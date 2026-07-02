-- Soft delete + audit columns สำหรับ accounting_transactions
-- รันใน Supabase SQL Editor (รันซ้ำได้)

ALTER TABLE accounting_transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_accounting_transactions_active
  ON accounting_transactions(transaction_date DESC)
  WHERE deleted_at IS NULL;
