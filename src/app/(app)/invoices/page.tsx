"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Modal, Input, Select, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/mobile-ui";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, type Invoice, type InvoiceStatus } from "@/lib/extras-types";
import { logActivity, notifyUser, exportToCSV } from "@/lib/activity";
import type { Client } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Download } from "lucide-react";

const empty = { client_id: "", title: "", total_amount: "", status: "draft" as InvoiceStatus, due_date: "", notes: "" };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<(Invoice & { client?: Client })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [payModal, setPayModal] = useState<Invoice | null>(null);
  const [form, setForm] = useState(empty);
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const [inv, cls] = await Promise.all([
      supabase.from("invoices").select("*, client:clients(*), payments:invoice_payments(*)").order("created_at", { ascending: false }),
      supabase.from("clients").select("*"),
    ]);
    setInvoices(inv.data ?? []);
    setClients(cls.data ?? []);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("invoices").insert({
      client_id: form.client_id,
      title: form.title,
      total_amount: parseFloat(form.total_amount),
      status: form.status,
      due_date: form.due_date || null,
      notes: form.notes || null,
      created_by: user?.id,
    });
    await logActivity("create", "invoice", null, form.title);
    setSaving(false);
    setModalOpen(false);
    setForm(empty);
    load();
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payModal) return;
    const supabase = createClient();
    const amount = parseFloat(payAmount);
    await supabase.from("invoice_payments").insert({
      invoice_id: payModal.id,
      amount,
      paid_at: new Date().toISOString().slice(0, 10),
    });
    const paid = (payModal.payments?.reduce((s, p) => s + p.amount, 0) ?? 0) + amount;
    const newStatus: InvoiceStatus = paid >= payModal.total_amount ? "paid" : "partial";
    await supabase.from("invoices").update({ status: newStatus }).eq("id", payModal.id);
    await logActivity("payment", "invoice", payModal.id, payModal.title, { amount });
    setPayModal(null);
    setPayAmount("");
    load();
  }

  function exportInvoices() {
    exportToCSV(
      "invoices.csv",
      ["ลูกค้า", "หัวข้อ", "ยอด", "สถานะ", "ครบกำหนด"],
      invoices.map((i) => [
        i.client?.name ?? "",
        i.title,
        String(i.total_amount),
        INVOICE_STATUS_LABELS[i.status],
        i.due_date ?? "",
      ])
    );
  }

  if (loading) return <div className="flex justify-center py-32"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="ใบแจ้งหนี้"
        description="ติดตามการเก็บเงิน มัดจำ และงวดชำระ"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportInvoices}><Download size={16} /> Export CSV</Button>
            <Button onClick={() => setModalOpen(true)}><Plus size={18} /> สร้างใบแจ้งหนี้</Button>
          </div>
        }
      />

      <div className="space-y-3">
        {invoices.map((inv) => {
          const paid = inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
          return (
            <div key={inv.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{inv.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[inv.status]}`}>
                      {INVOICE_STATUS_LABELS[inv.status]}
                    </span>
                  </div>
                  <p className="text-sm text-muted mt-1">{inv.client?.name} · ฿{inv.total_amount.toLocaleString()}</p>
                  {paid > 0 && <p className="text-xs text-emerald-400 mt-0.5">ชำระแล้ว ฿{paid.toLocaleString()}</p>}
                  {inv.due_date && <p className="text-xs text-muted">ครบ {inv.due_date}</p>}
                </div>
                {inv.status !== "paid" && (
                  <Button variant="secondary" onClick={() => { setPayModal(inv); setPayAmount(""); }}>
                    <DollarSign size={16} /> บันทึกชำระ
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {invoices.length === 0 && <p className="text-center text-muted py-12">ยังไม่มีใบแจ้งหนี้</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างใบแจ้งหนี้">
        <form onSubmit={handleSave} className="space-y-4">
          <Select label="ลูกค้า *" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required>
            <option value="">เลือกลูกค้า</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="หัวข้อ *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Input label="ยอดเงิน (บาท) *" type="number" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} required />
          <Input label="ครบกำหนด" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          <Textarea label="หมายเหตุ" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          <Button type="submit" loading={saving} className="w-full">สร้าง</Button>
        </form>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="บันทึกการชำระเงิน">
        <form onSubmit={addPayment} className="space-y-4">
          <p className="text-sm text-muted">{payModal?.title} — ยอด ฿{payModal?.total_amount.toLocaleString()}</p>
          <Input label="จำนวนเงิน (บาท) *" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
          <Button type="submit" className="w-full">บันทึก</Button>
        </form>
      </Modal>
    </div>
  );
}
