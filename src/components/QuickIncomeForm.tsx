"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import type { Invoice } from "@/lib/extras-types";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("invoices")
      .select("*, client:clients(*), payments:invoice_payments(*)")
      .neq("status", "paid")
      .order("created_at", { ascending: false });
    const list = (data ?? []).filter(
      (i) => (i.document_type ?? "invoice") !== "proposal"
    );
    setInvoices(list);
    setLoading(false);
  }

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
    const supabase = createClient();
    const payAmount = parseFloat(amount);

    const { error: payError } = await supabase.from("invoice_payments").insert({
      invoice_id: selected.id,
      amount: payAmount,
      paid_at: new Date().toISOString().slice(0, 10),
    });
    if (payError) {
      setSaving(false);
      setError(payError.message);
      return;
    }

    const paid =
      (selected.payments?.reduce((s, p) => s + p.amount, 0) ?? 0) + payAmount;
    const newStatus = paid >= selected.total_amount ? "paid" : "partial";
    const { error: statusError } = await supabase
      .from("invoices")
      .update({ status: newStatus })
      .eq("id", selected.id);
    if (statusError) {
      setSaving(false);
      setError(statusError.message);
      return;
    }

    setSaving(false);
    onDone();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!selected) {
    if (invoices.length === 0) {
      return (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm text-muted">ไม่มีใบแจ้งหนี้ค้างชำระ</p>
          <Link href="/invoices" className="text-sm text-accent hover:underline">
            ไปสร้างใบแจ้งหนี้ →
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        <p className="text-xs text-muted mb-2">เลือกใบที่ลูกค้าจ่ายแล้ว</p>
        {invoices.map((inv) => {
          const paid = inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
          const remaining = inv.total_amount - paid;
          return (
            <button
              key={inv.id}
              type="button"
              onClick={() => selectInvoice(inv)}
              className="w-full text-left p-3 rounded-xl border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors touch-manipulation"
            >
              <p className="font-medium text-sm truncate">{inv.title}</p>
              <p className="text-xs text-muted mt-0.5">
                {inv.client?.name} · คงเหลือ{" "}
                <span className="text-emerald-300 font-semibold">
                  ฿{remaining.toLocaleString()}
                </span>
              </p>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={() => setSelected(null)}
        className="text-xs text-accent hover:underline"
      >
        ← เลือกใบอื่น
      </button>
      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <p className="font-medium text-sm">{selected.title}</p>
        <p className="text-xs text-muted">{selected.client?.name}</p>
      </div>
      <Input
        label="รับเงิน (บาท)"
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
      />
      <Button type="submit" loading={saving} className="w-full">
        บันทึกรายรับ
      </Button>
    </form>
  );
}
