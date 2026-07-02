import { createClient } from "@/lib/supabase/client";
import type { AccountingEntryType } from "@/lib/extras-types";

export type AccountingTransactionInput = {
  type: AccountingEntryType;
  amount: number;
  transactionDate: string;
  categorySlug: string;
  description: string;
  memberId?: string | null;
  clientId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  vatAmount?: number;
  slipUrl?: string | null;
  slipFileName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
};

export type AccountingResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

function accountingError(message: string) {
  if (message.includes("deleted_at") || message.includes("updated_by")) {
    return "รัน supabase/add-accounting-audit.sql ใน Supabase ก่อน";
  }
  if (message.includes("relation") || message.includes("column")) {
    return "รัน supabase/add-accounting-ledger.sql ใน Supabase ก่อน";
  }
  return message;
}

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getCategoryId(slug: string): Promise<AccountingResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounting_categories")
    .select("id")
    .eq("slug", slug)
    .single();

  if (error) return { ok: false, error: accountingError(error.message) };
  return { ok: true, id: data?.id ?? null };
}

export async function saveAccountingTransaction(
  input: AccountingTransactionInput
): Promise<AccountingResult> {
  const supabase = createClient();
  const category = await getCategoryId(input.categorySlug);
  if (!category.ok) return category;

  const createdBy = input.createdBy ?? (await currentUserId());
  const payload = {
    type: input.type,
    amount: input.amount,
    transaction_date: input.transactionDate,
    category_id: category.id,
    description: input.description.trim(),
    member_id: input.memberId ?? null,
    client_id: input.clientId ?? null,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    vat_amount: input.vatAmount ?? 0,
    slip_url: input.slipUrl ?? null,
    slip_file_name: input.slipFileName ?? null,
    notes: input.notes?.trim() || null,
    created_by: createdBy,
  };

  if (input.sourceType && input.sourceId) {
    const { data: existing, error: lookupError } = await supabase
      .from("accounting_transactions")
      .select("id")
      .eq("source_type", input.sourceType)
      .eq("source_id", input.sourceId)
      .maybeSingle();

    if (lookupError) {
      return { ok: false, error: accountingError(lookupError.message) };
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("accounting_transactions")
        .update(payload)
        .eq("id", existing.id);
      if (error) return { ok: false, error: accountingError(error.message) };
      return { ok: true, id: existing.id };
    }
  }

  const { data, error } = await supabase
    .from("accounting_transactions")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { ok: false, error: accountingError(error.message) };
  return { ok: true, id: data?.id ?? null };
}

export async function updateAccountingTransaction(
  id: string,
  input: Omit<AccountingTransactionInput, "sourceType" | "sourceId" | "createdBy"> & {
    keepSlipUrl?: string | null;
    keepSlipFileName?: string | null;
  }
): Promise<AccountingResult> {
  const supabase = createClient();
  const category = await getCategoryId(input.categorySlug);
  if (!category.ok) return category;

  const updatedBy = await currentUserId();
  const payload = {
    type: input.type,
    amount: input.amount,
    transaction_date: input.transactionDate,
    category_id: category.id,
    description: input.description.trim(),
    member_id: input.memberId ?? null,
    client_id: input.clientId ?? null,
    vat_amount: input.vatAmount ?? 0,
    slip_url: input.slipUrl ?? input.keepSlipUrl ?? null,
    slip_file_name: input.slipFileName ?? input.keepSlipFileName ?? null,
    notes: input.notes?.trim() || null,
    updated_by: updatedBy,
  };

  const { error } = await supabase
    .from("accounting_transactions")
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: accountingError(error.message) };
  return { ok: true, id };
}

export async function softDeleteAccountingTransaction(
  id: string
): Promise<AccountingResult> {
  const supabase = createClient();
  const deletedBy = await currentUserId();
  const { error } = await supabase
    .from("accounting_transactions")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      updated_by: deletedBy,
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: accountingError(error.message) };
  return { ok: true, id };
}

export async function syncInvoicePaymentToLedger(input: {
  paymentId: string;
  invoiceId: string;
  amount: number;
  paidAt: string;
  invoiceTitle: string;
  clientId: string | null;
  invoiceTotal: number;
  invoiceVat: number | null | undefined;
  note?: string | null;
}) {
  const vatAmount =
    input.invoiceTotal > 0
      ? Number((((input.invoiceVat ?? 0) * input.amount) / input.invoiceTotal).toFixed(2))
      : 0;

  return saveAccountingTransaction({
    type: "income",
    amount: input.amount,
    transactionDate: input.paidAt,
    categorySlug: "client_payment",
    description: input.invoiceTitle || "รับชำระจากลูกค้า",
    clientId: input.clientId,
    sourceType: "invoice_payment",
    sourceId: input.paymentId,
    vatAmount,
    notes: input.note ?? null,
  });
}

export async function syncTeamPayoutToLedger(input: {
  payoutId: string;
  payeeId: string;
  amount: number;
  paidAt: string;
  description: string;
  slipUrl?: string | null;
  slipFileName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}) {
  return saveAccountingTransaction({
    type: "expense",
    amount: input.amount,
    transactionDate: input.paidAt,
    categorySlug: "team_payout",
    description: input.description,
    memberId: input.payeeId,
    sourceType: "team_payout",
    sourceId: input.payoutId,
    slipUrl: input.slipUrl ?? null,
    slipFileName: input.slipFileName ?? null,
    notes: input.notes ?? null,
    createdBy: input.createdBy ?? null,
  });
}

export async function syncTeamFundContributionToLedger(input: {
  contributionId: string;
  contributorId: string;
  amount: number;
  paidAt: string;
  description: string;
  slipUrl?: string | null;
  slipFileName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}) {
  return saveAccountingTransaction({
    type: "income",
    amount: input.amount,
    transactionDate: input.paidAt,
    categorySlug: "team_fund",
    description: input.description,
    memberId: input.contributorId,
    sourceType: "team_fund_contribution",
    sourceId: input.contributionId,
    slipUrl: input.slipUrl ?? null,
    slipFileName: input.slipFileName ?? null,
    notes: input.notes ?? null,
    createdBy: input.createdBy ?? null,
  });
}
