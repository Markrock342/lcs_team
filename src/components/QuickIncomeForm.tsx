"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { neonRequest } from "@/lib/neon/client";
import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { AmountField, FormActions, FormError } from "@/components/form-ui";
import { syncInvoicePaymentToLedger } from "@/lib/accounting";
import type { Invoice } from "@/lib/extras-types";
import { formatBaht } from "@/lib/money";
import type { Client } from "@/lib/types";

type Props = {
  onDone: () => void;
};

export function QuickIncomeForm({ onDone }: Props) {
  const [invoices, setInvoices] = useState<(Invoice & { client?: Client })[]>([]);
  const [selected, setSelected] = useState<(Invoice & { client?: Client }) | null>(
    null
  );
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const { invoices: data } = await neonRequest<{
        invoices: (Invoice & { client?: Client })[];
      }>("/api/neon/invoices", { cache: "no-store" });
      const list = (data ?? []).filter(
        (i) =>
          i.status !== "paid" &&
          (i.document_type ?? "invoice") !== "proposal" &&
          (i.document_type ?? "invoice") !== "quotation" &&
          (i.document_type ?? "invoice") !== "agreement"
      );
      setInvoices(list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดใบแจ้งหนี้ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Data is loaded once when the quick form opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  function selectInvoice(inv: Invoice & { client?: Client }) {
    setSelected(inv);
    const paid = inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
    setAmount(String(Math.max(inv.total_amount - paid, 0)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    const payAmount = parseFloat(amount);
    let payment: { id: string };
    try {
      const result = await neonRequest<{ payment: { id: string } }>(
        "/api/neon/invoices/payments",
        {
          method: "POST",
          body: JSON.stringify({
            invoice_id: selected.id,
            amount: payAmount,
            paid_at: paidAt,
          }),
        }
      );
      payment = result.payment;
    } catch (saveError) {
      setSaving(false);
      setError(saveError instanceof Error ? saveError.message : "บันทึกรายรับไม่สำเร็จ");
      return;
    }
    if (!payment?.id) {
      setSaving(false);
      setError("บันทึกรายรับแล้ว แต่ไม่พบเลขอ้างอิงรายการ");
      return;
    }

    const ledger = await syncInvoicePaymentToLedger({
      paymentId: payment.id,
      invoiceId: selected.id,
      amount: payAmount,
      paidAt,
      invoiceTitle: selected.title,
      clientId: selected.client_id,
      invoiceTotal: selected.total_amount,
      invoiceVat: selected.vat_amount,
    });
    if (!ledger.ok) {
      setSaving(false);
      setError(`บันทึกรายรับแล้ว แต่ลงบัญชีไม่สำเร็จ: ${ledger.error}`);
      return;
    }

    setSaving(false);
    onDone();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label="กำลังโหลดใบแจ้งหนี้">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!selected) {
    if (invoices.length === 0) {
      return (
        <div className="space-y-4 py-6 text-center">
          <FormError message={error} />
          <p className="text-base">ไม่มีใบแจ้งหนี้ค้างชำระ</p>
          <Link
            href="/invoices"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
          >
            ไปสร้างใบแจ้งหนี้
          </Link>
        </div>
      );
    }

    const q = query.trim().toLowerCase();
    const visible = q
      ? invoices.filter(
          (inv) =>
            inv.title.toLowerCase().includes(q) ||
            (inv.client?.name?.toLowerCase().includes(q) ?? false)
        )
      : invoices;

    return (
      <div className="space-y-3">
        <FormError message={error} />
        <p className="text-sm font-medium text-muted">เลือกใบแจ้งหนี้</p>
        {invoices.length > 5 && (
          <Input
            aria-label="ค้นหาใบแจ้งหนี้"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้าหรือชื่อใบ"
          />
        )}
        <ul className="space-y-2">
          {visible.map((inv) => {
            const paid = inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
            const remaining = Math.max(inv.total_amount - paid, 0);
            const percent = inv.total_amount > 0 ? Math.min((paid / inv.total_amount) * 100, 100) : 0;
            return (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => selectInvoice(inv)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:bg-card-hover touch-manipulation"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted">{inv.client?.name ?? "ไม่ระบุลูกค้า"}</p>
                    <p className="text-base font-medium leading-snug line-clamp-2">{inv.title}</p>
                    <p className="mt-1.5 text-sm text-muted">
                      ค้างรับ{" "}
                      <span className="text-base font-semibold tabular-nums text-(--status-green-fg)">
                        {formatBaht(remaining)}
                      </span>
                      {paid > 0 && (
                        <span className="tabular-nums"> · จ่ายแล้ว {formatBaht(paid)}</span>
                      )}
                    </p>
                    {paid > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
                        <div className="h-full rounded-full bg-(--status-green-fg)" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
        {visible.length === 0 && (
          <p className="py-6 text-center text-[0.9375rem] text-muted">ไม่พบใบแจ้งหนี้ที่ค้นหา</p>
        )}
      </div>
    );
  }

  const selectedPaid = selected.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
  const selectedRemaining = Math.max(selected.total_amount - selectedPaid, 0);
  const payNow = parseFloat(amount);
  const validAmount = Number.isFinite(payNow) && payNow > 0;
  const leftAfter = validAmount ? selectedRemaining - payNow : selectedRemaining;

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <FormError message={error} />
      <button
        type="button"
        onClick={() => setSelected(null)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-accent hover:bg-card-hover"
      >
        <ChevronLeft size={18} /> เลือกใบอื่น
      </button>

      <div className="flex items-start gap-3 rounded-2xl bg-surface-soft p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--status-green-bg) text-(--status-green-fg)">
          <ReceiptText size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{selected.client?.name ?? "ไม่ระบุลูกค้า"}</p>
          <p className="text-base font-medium leading-snug">{selected.title}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-muted">ยอดทั้งใบ</dt>
            <dd className="text-right tabular-nums">{formatBaht(selected.total_amount)}</dd>
            <dt className="text-muted">ค้างรับ</dt>
            <dd className="text-right font-semibold tabular-nums">{formatBaht(selectedRemaining)}</dd>
          </dl>
        </div>
      </div>

      <AmountField
        label="รับเงินครั้งนี้"
        tone="income"
        value={amount}
        onChange={setAmount}
        shortcuts={
          selectedRemaining > 0
            ? [
                { label: "เต็มจำนวน", value: selectedRemaining },
                { label: "ครึ่งหนึ่ง", value: Math.round((selectedRemaining / 2) * 100) / 100 },
              ]
            : undefined
        }
        hint={
          validAmount
            ? leftAfter > 0
              ? `เหลือค้างรับ ${formatBaht(leftAfter)}`
              : leftAfter < 0
                ? `เกินยอดค้าง ${formatBaht(-leftAfter)}`
                : "ปิดยอดใบนี้พอดี"
            : undefined
        }
      />

      <Input
        label="วันที่รับเงิน"
        type="date"
        value={paidAt}
        onChange={(e) => setPaidAt(e.target.value)}
        required
      />

      <FormActions>
        <Button type="submit" loading={saving}>
          บันทึกรับเงิน{validAmount ? ` ${formatBaht(payNow)}` : ""}
        </Button>
      </FormActions>
    </form>
  );
}
