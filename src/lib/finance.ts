import type { Client } from "./types";
import type { Invoice, InvoicePayment, TeamPayout } from "./extras-types";

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

export function mergeFinanceEntries(
  payments: Parameters<typeof invoicePaymentToEntry>[0][],
  payouts: TeamPayout[]
): FinanceEntry[] {
  const items = [
    ...payments.map(invoicePaymentToEntry),
    ...payouts.map(teamPayoutToEntry),
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
