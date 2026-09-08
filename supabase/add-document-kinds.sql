-- ใบเสนอราคา (quotation) และสัญญาทีม (agreement)
-- รันใน Supabase SQL Editor หลัง add-invoice-documents.sql (รันซ้ำได้)

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_document_type_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_document_type_check
  CHECK (document_type IN ('invoice', 'receipt', 'proposal', 'quotation', 'agreement'));

ALTER TABLE invoices ALTER COLUMN client_id DROP NOT NULL;
