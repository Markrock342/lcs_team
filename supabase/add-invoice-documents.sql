-- เอกสารใบแจ้งหนี้ / ใบเสร็จ / Workflow Proposal
-- รันใน Supabase SQL Editor (รันซ้ำได้)

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'invoice'
  CHECK (document_type IN ('invoice', 'receipt', 'proposal'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS doc_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_in_words TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_meta JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_invoices_doc_type ON invoices(document_type);
