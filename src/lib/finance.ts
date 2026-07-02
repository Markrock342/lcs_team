import type { Client } from "./types";
import type {
  AccountingCategory,
  AccountingTransaction,
  Invoice,
  InvoicePayment,
  TeamFundContribution,
  TeamPayout,
} from "./extras-types";

export type FinanceEntryType = "income" | "expense";

export type FinanceEntry = {
  id: string;
  type: FinanceEntryType;
  amount: number;
  date: string;
  title: string;
  subtitle: string;
  detail?: string;
  slip_url?: string | null;
  link?: string;
};

export type AccountingSummary = {
  income: number;
  expense: number;
  net: number;
  fund: number;
  vat: number;
};

export const DEFAULT_INCOME_CATEGORY = "other_income";
export const DEFAULT_EXPENSE_CATEGORY = "other_expense";
export const FUND_CATEGORY = "team_fund";

function personOrClientLabel(t: AccountingTransaction): string {
  if (t.client?.name) return t.client.name;
  if (t.member?.display_name) return t.member.display_name;
  return t.type === "income" ? "รายรับ" : "รายจ่าย";
}

export function accountingTransactionToEntry(
  t: AccountingTransaction
): FinanceEntry {
  const category = t.category?.name ?? (t.type === "income" ? "รายรับ" : "รายจ่าย");
  return {
    id: `ledger-${t.id}`,
    type: t.type,
    amount: t.amount,
    date: t.transaction_date,
    title: t.description,
    subtitle: `${category} · ${personOrClientLabel(t)}`,
    detail: t.notes ?? undefined,
    slip_url: t.slip_url,
    link: t.source_type === "invoice_payment" ? "/invoices" : "/finance",
  };
}

export function summarizeAccounting(
  transactions: AccountingTransaction[]
): AccountingSummary {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const fund = transactions
    .filter((t) => t.category?.slug === FUND_CATEGORY)
    .reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0);
  const vat = transactions.reduce((sum, t) => sum + (t.vat_amount ?? 0), 0);
  return { income, expense, net: income - expense, fund, vat };
}

export function categoriesByType(
  categories: AccountingCategory[],
  type: FinanceEntryType
): AccountingCategory[] {
  return categories
    .filter((c) => c.type === type)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function filterAccountingByPeriod(
  transactions: AccountingTransaction[],
  period: string
) {
  if (period === "all") return transactions;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return transactions.filter((t) => {
    const d = new Date(t.transaction_date);
    if (period === "month") {
      return d.getFullYear() === y && d.getMonth() === m;
    }
    if (period === "year") {
      return d.getFullYear() === y;
    }
    return true;
  });
}

export function invoicePaymentToEntry(
  p: InvoicePayment & {
    invoice?: (Invoice & { client?: Client | null }) | null;
  }
): FinanceEntry {
  const inv = p.invoice;
  const docType = inv?.document_type ?? "invoice";
  const typeLabel =
    docType === "receipt" ? "ใบเสร็จ" : docType === "proposal" ? "Proposal" : "ใบแจ้งหนี้";

  return {
    id: `income-${p.id}`,
    type: "income",
    amount: p.amount,
    date: p.paid_at,
    title: inv?.title ?? "รับชำระจากลูกค้า",
    subtitle: `${inv?.client?.name ?? "ลูกค้า"} · ${typeLabel}${inv?.doc_number ? ` · ${inv.doc_number}` : ""}`,
    detail: p.note ?? undefined,
    link: "/invoices",
  };
}

export function teamPayoutToEntry(p: TeamPayout): FinanceEntry {
  return {
    id: `expense-${p.id}`,
    type: "expense",
    amount: p.amount,
    date: p.paid_at,
    title: p.description,
    subtitle: `${p.payer?.display_name ?? "ทีม"} → ${p.payee?.display_name ?? "ทีม"}`,
    detail: p.notes ?? undefined,
    slip_url: p.slip_url,
    link: "/payouts",
  };
}

export function teamFundContributionToEntry(
  c: TeamFundContribution
): FinanceEntry {
  return {
    id: `fund-income-${c.id}`,
    type: "income",
    amount: c.amount,
    date: c.paid_at,
    title: c.description || "เก็บเงินกองกลาง",
    subtitle: `${c.contributor?.display_name ?? "สมาชิก"} → กองกลาง`,
    detail: c.notes ?? undefined,
    slip_url: c.slip_url,
    link: "/finance",
  };
}

export function mergeFinanceEntries(
  payments: Parameters<typeof invoicePaymentToEntry>[0][],
  payouts: TeamPayout[],
  fundContributions: TeamFundContribution[] = []
): FinanceEntry[] {
  const items = [
    ...payments.map(invoicePaymentToEntry),
    ...payouts.map(teamPayoutToEntry),
    ...fundContributions.map(teamFundContributionToEntry),
  ];
  return items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function sumByType(entries: FinanceEntry[], type: FinanceEntryType) {
  return entries
    .filter((e) => e.type === type)
    .reduce((s, e) => s + e.amount, 0);
}

export function filterByPeriod(entries: FinanceEntry[], period: string) {
  if (period === "all") return entries;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return entries.filter((e) => {
    const d = new Date(e.date);
    if (period === "month") {
      return d.getFullYear() === y && d.getMonth() === m;
    }
    if (period === "year") {
      return d.getFullYear() === y;
    }
    return true;
  });
}
