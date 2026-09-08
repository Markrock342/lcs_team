-- แผนกบัญชี + ป้าย BE / FN / UI
-- รันใน Supabase SQL Editor (รันซ้ำได้)
-- FN = Front End, UI = Design, บัญชี ≠ FN

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pm', 'accounting', 'backend', 'frontend', 'design', 'sale', 'guest'));

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role IN ('admin', 'accounting')
        OR COALESCE(display_roles, ARRAY[]::TEXT[]) @> ARRAY['accounting']::TEXT[]
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_finance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;

DROP POLICY IF EXISTS "Team payouts" ON team_payouts;
CREATE POLICY "Team payouts" ON team_payouts
  FOR ALL TO authenticated
  USING (public.can_manage_finance())
  WITH CHECK (public.can_manage_finance());

DROP POLICY IF EXISTS "Team fund contributions" ON team_fund_contributions;
CREATE POLICY "Team fund contributions"
  ON team_fund_contributions
  FOR ALL TO authenticated
  USING (public.can_manage_finance())
  WITH CHECK (public.can_manage_finance());

DROP POLICY IF EXISTS "Team accounting transactions" ON accounting_transactions;
CREATE POLICY "Team accounting transactions"
  ON accounting_transactions
  FOR ALL TO authenticated
  USING (public.can_manage_finance())
  WITH CHECK (public.can_manage_finance());

DROP POLICY IF EXISTS "Team accounting categories" ON accounting_categories;
CREATE POLICY "Team accounting categories"
  ON accounting_categories
  FOR ALL TO authenticated
  USING (public.can_manage_finance())
  WITH CHECK (public.can_manage_finance());

-- PM ยังบันทึกชำระใบแจ้งหนี้ได้ — ลงสมุดบัญชีด้วย trigger ไม่ต้องมีสิทธิ์บัญชี
CREATE OR REPLACE FUNCTION public.sync_invoice_payment_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_id UUID;
  inv RECORD;
  vat_amt NUMERIC(12,2);
  existing_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.accounting_transactions
    SET
      deleted_at = COALESCE(deleted_at, NOW()),
      deleted_by = COALESCE(deleted_by, auth.uid()),
      updated_by = auth.uid()
    WHERE source_type = 'invoice_payment'
      AND source_id = OLD.id
      AND deleted_at IS NULL;
    RETURN OLD;
  END IF;

  SELECT id INTO cat_id
  FROM public.accounting_categories
  WHERE slug = 'client_payment'
  LIMIT 1;
  IF cat_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, title, client_id, total_amount, vat_amount
  INTO inv
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  vat_amt := 0;
  IF inv.total_amount IS NOT NULL AND inv.total_amount > 0 THEN
    vat_amt := ROUND((COALESCE(inv.vat_amount, 0) * NEW.amount) / inv.total_amount, 2);
  END IF;

  SELECT id INTO existing_id
  FROM public.accounting_transactions
  WHERE source_type = 'invoice_payment'
    AND source_id = NEW.id
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.accounting_transactions
    SET
      amount = NEW.amount,
      transaction_date = NEW.paid_at,
      category_id = cat_id,
      description = COALESCE(inv.title, 'รับชำระจากลูกค้า'),
      client_id = inv.client_id,
      vat_amount = vat_amt,
      notes = NEW.note,
      updated_by = auth.uid(),
      deleted_at = NULL,
      deleted_by = NULL
    WHERE id = existing_id;
  ELSE
    INSERT INTO public.accounting_transactions (
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
      created_by
    ) VALUES (
      'income',
      NEW.amount,
      NEW.paid_at,
      cat_id,
      COALESCE(inv.title, 'รับชำระจากลูกค้า'),
      inv.client_id,
      'invoice_payment',
      NEW.id,
      vat_amt,
      NEW.note,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invoice_payment_to_ledger() FROM PUBLIC;

DROP TRIGGER IF EXISTS invoice_payments_sync_ledger ON invoice_payments;
CREATE TRIGGER invoice_payments_sync_ledger
  AFTER INSERT OR UPDATE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_payment_to_ledger();

DROP TRIGGER IF EXISTS invoice_payments_sync_ledger_delete ON invoice_payments;
CREATE TRIGGER invoice_payments_sync_ledger_delete
  AFTER DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_payment_to_ledger();

-- sonthaya: สิทธิ์จริง BE พ่วงป้ายบัญชี (เข้าหน้าการเงินได้)
UPDATE public.profiles
SET
  role = 'backend',
  display_roles = ARRAY['backend', 'accounting']::TEXT[]
WHERE lower(username) = 'sonthaya20322';
