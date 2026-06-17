"use client";

import { useEffect, useState } from "react";
import { Plus, DollarSign, Download, Eye, Printer, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Modal } from "@/components/ui";
import { PageHeader, FilterTabs } from "@/components/mobile-ui";
import { LCSDocumentPreview, printDocument } from "@/components/LCSDocumentPreview";
import { InvoiceDocumentForm } from "@/components/InvoiceDocumentForm";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/extras-types";
import {
  DOCUMENT_TEMPLATES,
  DOCUMENT_TYPE_LABELS,
  computeAmountInWords,
  sumLineItems,
  type DocumentFormData,
  type DocumentType,
} from "@/lib/invoice-documents";
import { logActivity, exportToCSV } from "@/lib/activity";
import type { Client } from "@/lib/types";

function invoiceToForm(inv: Invoice): DocumentFormData {
  return {
    document_type: (inv.document_type ?? "invoice") as DocumentType,
    client_id: inv.client_id,
    title: inv.title,
    doc_number: inv.doc_number ?? "",
    issue_date: inv.issue_date ?? new Date().toISOString().slice(0, 10),
    status: inv.status,
    due_date: inv.due_date ?? "",
    payment_method: inv.payment_method ?? "",
    notes: inv.notes ?? "",
    vat_amount: String(inv.vat_amount ?? 0),
    line_items: inv.line_items?.length
      ? inv.line_items
      : [{ description: inv.title, quantity: 1, unit: "หน่วย", unitPrice: inv.total_amount }],
    document_meta: (inv.document_meta as DocumentFormData["document_meta"]) ?? {},
  };
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<(Invoice & { client?: Client })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [payModal, setPayModal] = useState<Invoice | null>(null);
  const [form, setForm] = useState<DocumentFormData | null>(null);
  const [previewData, setPreviewData] = useState<{
    form: DocumentFormData;
    client?: Client | null;
  } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const [inv, cls] = await Promise.all([
      supabase
        .from("invoices")
        .select("*, client:clients(*), payments:invoice_payments(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*"),
    ]);
    setInvoices(inv.data ?? []);
    setClients(cls.data ?? []);
    setLoading(false);
  }

  const filtered = invoices.filter((i) =>
    typeFilter === "all" ? true : (i.document_type ?? "invoice") === typeFilter
  );

  function openTemplate(id: string) {
    const t = DOCUMENT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setForm(t.build());
    setTemplateOpen(false);
    setFormOpen(true);
    setDbError("");
  }

  function openPreview(inv: Invoice) {
    setPreviewData({ form: invoiceToForm(inv), client: inv.client });
    setPreviewOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setDbError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const subtotal = sumLineItems(form.line_items);
    const vat = parseFloat(form.vat_amount || "0") || 0;
    const total = subtotal + vat;

    const payload = {
      client_id: form.client_id,
      title: form.title,
      total_amount: total,
      status: form.status as InvoiceStatus,
      due_date: form.due_date || null,
      notes: form.notes || null,
      document_type: form.document_type,
      doc_number: form.doc_number,
      issue_date: form.issue_date,
      payment_method: form.payment_method,
      amount_in_words: computeAmountInWords(total),
      vat_amount: vat,
      line_items: form.line_items,
      document_meta: form.document_meta,
      created_by: user?.id,
    };

    const { error } = await supabase.from("invoices").insert(payload);

    setSaving(false);

    if (error) {
      if (error.message.includes("column") || error.message.includes("schema")) {
        setDbError("รัน supabase/add-invoice-documents.sql ใน Supabase ก่อน");
      } else {
        setDbError(error.message);
      }
      return;
    }

    await logActivity("create", "invoice", null, form.title, {
      type: form.document_type,
    });
    setFormOpen(false);
    setForm(null);
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
    const paid =
      (payModal.payments?.reduce((s, p) => s + p.amount, 0) ?? 0) + amount;
    const newStatus: InvoiceStatus =
      paid >= payModal.total_amount ? "paid" : "partial";
    await supabase.from("invoices").update({ status: newStatus }).eq("id", payModal.id);
    setPayModal(null);
    setPayAmount("");
    load();
  }

  function exportInvoices() {
    exportToCSV(
      "documents.csv",
      ["ประเภท", "เลขที่", "ลูกค้า", "หัวข้อ", "ยอด", "สถานะ"],
      filtered.map((i) => [
        DOCUMENT_TYPE_LABELS[(i.document_type ?? "invoice") as DocumentType],
        i.doc_number ?? "",
        i.client?.name ?? "",
        i.title,
        String(i.total_amount),
        INVOICE_STATUS_LABELS[i.status],
      ])
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="ใบแจ้งหนี้ & เอกสาร"
        description="ใบแจ้งหนี้ · ใบเสร็จ · Workflow Proposal"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={exportInvoices}>
              <Download size={16} /> Export
            </Button>
            <Button onClick={() => setTemplateOpen(true)}>
              <Plus size={18} /> สร้างเอกสาร
            </Button>
          </div>
        }
      />

      <FilterTabs
        active={typeFilter}
        onChange={setTypeFilter}
        tabs={[
          { key: "all", label: "ทั้งหมด", count: invoices.length },
          {
            key: "invoice",
            label: "ใบแจ้งหนี้",
            count: invoices.filter((i) => (i.document_type ?? "invoice") === "invoice").length,
          },
          {
            key: "receipt",
            label: "ใบเสร็จ",
            count: invoices.filter((i) => i.document_type === "receipt").length,
          },
          {
            key: "proposal",
            label: "Workflow",
            count: invoices.filter((i) => i.document_type === "proposal").length,
          },
        ]}
      />

      <div className="space-y-3">
        {filtered.map((inv) => {
          const paid = inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
          const docType = (inv.document_type ?? "invoice") as DocumentType;

          return (
            <div key={inv.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                      {DOCUMENT_TYPE_LABELS[docType]}
                    </span>
                    {inv.doc_number && (
                      <span className="text-xs text-muted">{inv.doc_number}</span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[inv.status]}`}
                    >
                      {INVOICE_STATUS_LABELS[inv.status]}
                    </span>
                  </div>
                  <h3 className="font-semibold mt-1 truncate">{inv.title}</h3>
                  <p className="text-sm text-muted">
                    {inv.client?.name} · ฿{inv.total_amount.toLocaleString()}
                  </p>
                  {paid > 0 && (
                    <p className="text-xs text-emerald-400">ชำระแล้ว ฿{paid.toLocaleString()}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="secondary" onClick={() => openPreview(inv)}>
                    <Eye size={16} /> ดู / พิมพ์
                  </Button>
                  {inv.status !== "paid" && docType === "invoice" && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setPayModal(inv);
                        setPayAmount("");
                      }}
                    >
                      <DollarSign size={16} /> ชำระ
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted py-12">ยังไม่มีเอกสาร — กด「สร้างเอกสาร」</p>
        )}
      </div>

      {/* เลือก template */}
      <Modal open={templateOpen} onClose={() => setTemplateOpen(false)} title="เลือก Template">
        <div className="space-y-2">
          {DOCUMENT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openTemplate(t.id)}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:border-accent/40 hover:bg-card-hover text-left transition-colors"
            >
              <FileText className="text-accent shrink-0" size={22} />
              <span className="font-medium text-sm">{t.label}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* ฟอร์มกรอก */}
      <Modal
        open={formOpen && !!form}
        onClose={() => {
          setFormOpen(false);
          setForm(null);
        }}
        title={
          form
            ? `สร้าง${DOCUMENT_TYPE_LABELS[form.document_type]}`
            : "สร้างเอกสาร"
        }
      >
        {dbError && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {dbError}
          </div>
        )}
        {form && (
          <InvoiceDocumentForm
            form={form}
            clients={clients}
            saving={saving}
            onChange={setForm}
            onSubmit={handleSave}
          />
        )}
      </Modal>

      {/* Preview + Print */}
      <Modal
        open={previewOpen && !!previewData}
        onClose={() => setPreviewOpen(false)}
        title="ตัวอย่างเอกสาร"
      >
        <div className="space-y-3">
          <div className="flex gap-2 justify-end print:hidden">
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              ปิด
            </Button>
            <Button
              onClick={() => {
                printDocument();
              }}
            >
              <Printer size={16} /> พิมพ์ / Save PDF
            </Button>
          </div>
          <div
            id="document-print-area"
            className="rounded-xl overflow-hidden border border-zinc-300 max-h-[65vh] overflow-y-auto"
          >
            {previewData && (
              <LCSDocumentPreview
                data={{
                  ...previewData.form,
                  total_amount: sumLineItems(previewData.form.line_items),
                  amount_in_words: computeAmountInWords(
                    sumLineItems(previewData.form.line_items) +
                      (parseFloat(previewData.form.vat_amount) || 0)
                  ),
                }}
                client={previewData.client}
              />
            )}
          </div>
        </div>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="บันทึกการชำระเงิน">
        <form onSubmit={addPayment} className="space-y-4">
          <p className="text-sm text-muted">
            {payModal?.title} — ฿{payModal?.total_amount.toLocaleString()}
          </p>
          <input
            type="number"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm"
            placeholder="จำนวนเงิน (บาท)"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            required
          />
          <Button type="submit" className="w-full">
            บันทึก
          </Button>
        </form>
      </Modal>
    </div>
  );
}
