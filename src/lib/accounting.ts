import { neonRequest } from "@/lib/neon/client";
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

export async function saveAccountingTransaction(
  input: AccountingTransactionInput
): Promise<AccountingResult> {
  const payload = {
    type: input.type,
    amount: input.amount,
    transaction_date: input.transactionDate,
    category_slug: input.categorySlug,
    description: input.description.trim(),
    member_id: input.memberId ?? null,
    client_id: input.clientId ?? null,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    vat_amount: input.vatAmount ?? 0,
    slip_url: input.slipUrl ?? null,
    slip_file_name: input.slipFileName ?? null,
    notes: input.notes?.trim() || null,
  };
  try {
    const { row } = await neonRequest<{ row: { id: string } }>("/api/neon/accounting", {
      method: "POST",
      body: JSON.stringify({ resource: "transaction", data: payload }),
    });
    return { ok: true, id: row?.id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "บันทึกรายการบัญชีไม่สำเร็จ" };
  }
}

export async function updateAccountingTransaction(
  id: string,
  input: Omit<AccountingTransactionInput, "sourceType" | "sourceId" | "createdBy"> & {
    keepSlipUrl?: string | null;
    keepSlipFileName?: string | null;
  }
): Promise<AccountingResult> {
  const payload = {
    type: input.type,
    amount: input.amount,
    transaction_date: input.transactionDate,
    category_slug: input.categorySlug,
    description: input.description.trim(),
    member_id: input.memberId ?? null,
    client_id: input.clientId ?? null,
    vat_amount: input.vatAmount ?? 0,
    slip_url: input.slipUrl ?? input.keepSlipUrl ?? null,
    slip_file_name: input.slipFileName ?? input.keepSlipFileName ?? null,
    notes: input.notes?.trim() || null,
  };
  try {
    await neonRequest("/api/neon/accounting", {
      method: "PATCH",
      body: JSON.stringify({ id, data: payload }),
    });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "แก้ไขรายการบัญชีไม่สำเร็จ" };
  }
}

export async function softDeleteAccountingTransaction(
  id: string
): Promise<AccountingResult> {
  try {
    await neonRequest("/api/neon/accounting", { method: "DELETE", body: JSON.stringify({ id }) });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ลบรายการบัญชีไม่สำเร็จ" };
  }
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
