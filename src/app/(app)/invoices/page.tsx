"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, DollarSign, Eye, Printer, FileText, Pencil, Receipt, FileDown, Trash2, MoreHorizontal } from "lucide-react";
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
  buildReceiptFromInvoice,
  computeAmountInWords,
  getReceiptSourceId,
  sumLineItems,
  type DocumentFormData,
  type DocumentType,
} from "@/lib/invoice-documents";
import { logActivity, exportToCSV } from "@/lib/activity";
import { documentPdfFilename, exportDocumentPdf } from "@/lib/export-pdf";
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

function findReceiptForInvoice(list: (Invoice & { client?: Client })[], invoiceId: string) {
  return list.find(
    (i) =>
      i.document_type === "receipt" && getReceiptSourceId(i.document_meta) === invoiceId
  );
}

function buildPayload(form: DocumentFormData) {
  const subtotal = sumLineItems(form.line_items);
  const vat = parseFloat(form.vat_amount || "0") || 0;
  const total = subtotal + vat;
  return {
    payload: {
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
    },
    total,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [convertModal, setConvertModal] = useState<Invoice | null>(null);
  const [previewData, setPreviewData] = useState<{
    form: DocumentFormData;
    client?: Client | null;
  } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("โอนเงิน / เงินสด");
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
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
    setEditingId(null);
    setForm(t.build());
    setTemplateOpen(false);
    setFormOpen(true);
    setDbError("");
  }

  function openEdit(inv: Invoice) {
    setEditingId(inv.id);
    setForm(invoiceToForm(inv));
    setFormOpen(true);
    setDbError("");
  }

  function openReceiptFromInvoice(inv: Invoice, editFirst = false) {
    const receiptForm = buildReceiptFromInvoice(inv);
    if (editFirst) {
      setEditingId(null);
      setForm(receiptForm);
      setFormOpen(true);
      setConvertModal(null);
      setDbError("");
      return;
    }
    saveReceipt(receiptForm, inv.id);
  }

  async function saveReceipt(receiptForm: DocumentFormData, sourceInvoiceId: string) {
    setSaving(true);
    setDbError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { payload } = buildPayload(receiptForm);

    const { data: created, error } = await supabase
      .from("invoices")
      .insert({ ...payload, created_by: user?.id })
      .select("id, doc_number")
      .single();

    if (error) {
      setSaving(false);
      if (error.message.includes("column") || error.message.includes("schema")) {
        setDbError("รัน supabase/add-invoice-documents.sql ใน Supabase ก่อน");
      } else {
        setDbError(error.message);
      }
      return;
    }

    const source = invoices.find((i) => i.id === sourceInvoiceId);
    const sourceMeta = (source?.document_meta as Record<string, unknown>) ?? {};
    await supabase
      .from("invoices")
      .update({
        document_meta: {
          ...sourceMeta,
          receipt_id: created.id,
          receipt_doc_number: created.doc_number,
        },
      })
      .eq("id", sourceInvoiceId);

    await logActivity("create", "invoice", created.id, receiptForm.title, {
      type: "receipt",
      from_invoice: sourceInvoiceId,
    });

    setSaving(false);
    setConvertModal(null);
    setFormOpen(false);
    setForm(null);
    load();
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

    const { payload } = buildPayload(form);

    const sourceInvoiceId = getReceiptSourceId(
      form.document_meta as Record<string, unknown>
    );

    let error;
    let createdId: string | null = null;
    if (editingId) {
      ({ error } = await supabase.from("invoices").update(payload).eq("id", editingId));
    } else {
      const result = await supabase
        .from("invoices")
        .insert({ ...payload, created_by: user?.id })
        .select("id, doc_number")
        .single();
      error = result.error;
      createdId = result.data?.id ?? null;

      if (!error && sourceInvoiceId && form.document_type === "receipt" && createdId) {
        const source = invoices.find((i) => i.id === sourceInvoiceId);
        const sourceMeta = (source?.document_meta as Record<string, unknown>) ?? {};
        await supabase
          .from("invoices")
          .update({
            document_meta: {
              ...sourceMeta,
              receipt_id: createdId,
              receipt_doc_number: result.data?.doc_number,
            },
          })
          .eq("id", sourceInvoiceId);
      }
    }

    setSaving(false);

    if (error) {
      if (error.message.includes("column") || error.message.includes("schema")) {
        setDbError("รัน supabase/add-invoice-documents.sql ใน Supabase ก่อน");
      } else {
        setDbError(error.message);
      }
      return;
    }

    if (editingId) {
      await logActivity("update", "invoice", editingId, form.title, {
        type: form.document_type,
      });
    } else {
      await logActivity("create", "invoice", createdId, form.title, {
        type: form.document_type,
      });
    }

    setFormOpen(false);
    setForm(null);
    setEditingId(null);
    setConvertModal(null);
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

    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "paid" && payMethod) {
      updates.payment_method = payMethod;
    }
    await supabase.from("invoices").update(updates).eq("id", payModal.id);

    const paidInvoice: Invoice = {
      ...payModal,
      status: newStatus,
      payment_method: payMethod || payModal.payment_method,
    };

    setPayModal(null);
    setPayAmount("");

    const docType = (paidInvoice.document_type ?? "invoice") as DocumentType;
    const shouldOfferReceipt =
      newStatus === "paid" &&
      docType === "invoice" &&
      !findReceiptForInvoice(invoices, paidInvoice.id);

    await load();

    if (shouldOfferReceipt) {
      setConvertModal(paidInvoice);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    const docType = (inv.document_type ?? "invoice") as DocumentType;
    const linkedReceipt =
      docType === "invoice" ? findReceiptForInvoice(invoices, inv.id) : undefined;

    let msg = `ลบ${DOCUMENT_TYPE_LABELS[docType]} "${inv.title}"?`;
    if (linkedReceipt) {
      msg += `\n(ใบเสร็จ ${linkedReceipt.doc_number} จะถูกลบด้วย)`;
    }
    if (!confirm(msg)) return;

    const supabase = createClient();

    if (linkedReceipt) {
      await supabase.from("invoices").delete().eq("id", linkedReceipt.id);
    }

    if (docType === "receipt") {
      const sourceId = getReceiptSourceId(inv.document_meta);
      if (sourceId) {
        const source = invoices.find((i) => i.id === sourceId);
        if (source) {
          const meta = { ...(source.document_meta as Record<string, unknown>) };
          delete meta.receipt_id;
          delete meta.receipt_doc_number;
          await supabase.from("invoices").update({ document_meta: meta }).eq("id", sourceId);
        }
      }
    }

    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) {
      alert(error.message);
      return;
    }

    await logActivity("delete", "invoice", inv.id, inv.title, { type: docType });
    load();
  }

  async function handleExportPdf() {
    if (!previewData) return;
    setExportingPdf(true);
    try {
      await exportDocumentPdf(
        "document-pdf-root",
        documentPdfFilename(previewData.form.doc_number, previewData.form.title)
      );
    } catch (err) {
      console.error(err);
      alert("Export PDF ไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setExportingPdf(false);
    }
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
        title="ใบแจ้งหนี้"
        description="สร้างเอกสาร — รับเงินได้ที่หน้าการเงิน"
        action={
          <Button onClick={() => setTemplateOpen(true)}>
            <Plus size={18} /> สร้างเอกสาร
          </Button>
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
          const linkedReceipt =
            docType === "invoice" ? findReceiptForInvoice(invoices, inv.id) : undefined;

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
                  {linkedReceipt && (
                    <p className="text-xs text-muted mt-0.5">
                      ใบเสร็จ: {linkedReceipt.doc_number}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {inv.status !== "paid" &&
                    (docType === "invoice" || docType === "receipt") && (
                      <Button
                        onClick={() => {
                          setPayModal(inv);
                          const paidAmt =
                            inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
                          setPayAmount(String(Math.max(inv.total_amount - paidAmt, 0)));
                          setPayMethod(inv.payment_method || "โอนเงิน / เงินสด");
                        }}
                        className="px-3"
                      >
                        <DollarSign size={16} />
                        <span className="ml-1.5">รับเงิน</span>
                      </Button>
                    )}
                  <Button variant="secondary" onClick={() => openPreview(inv)} className="px-3">
                    <Eye size={16} />
                    <span className="hidden sm:inline ml-1.5">ดู</span>
                  </Button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setMenuOpenId(menuOpenId === inv.id ? null : inv.id)
                      }
                      className="p-2.5 rounded-xl border border-border hover:bg-card-hover text-muted touch-manipulation"
                      title="เมนู"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuOpenId === inv.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setMenuOpenId(null)}
                        />
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-card border border-border rounded-xl shadow-xl py-1 text-sm">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover text-left"
                            onClick={() => {
                              setMenuOpenId(null);
                              openEdit(inv);
                            }}
                          >
                            <Pencil size={15} /> แก้ไข
                          </button>
                          {inv.status !== "paid" && docType === "invoice" && (
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover text-left"
                              onClick={() => {
                                setMenuOpenId(null);
                                setPayModal(inv);
                                setPayAmount("");
                                setPayMethod(inv.payment_method || "โอนเงิน / เงินสด");
                              }}
                            >
                              <DollarSign size={15} /> บันทึกชำระ
                            </button>
                          )}
                          {docType === "invoice" &&
                            inv.status === "paid" &&
                            !linkedReceipt && (
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover text-left"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  openReceiptFromInvoice(inv, true);
                                }}
                              >
                                <Receipt size={15} /> สร้างใบเสร็จ
                              </button>
                            )}
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-red-400 text-left"
                            onClick={() => {
                              setMenuOpenId(null);
                              deleteInvoice(inv);
                            }}
                          >
                            <Trash2 size={15} /> ลบ
                          </button>
                        </div>
                      </>
                    )}
                  </div>
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
          setEditingId(null);
        }}
        title={
          form
            ? editingId
              ? `แก้ไข${DOCUMENT_TYPE_LABELS[form.document_type]}`
              : `สร้าง${DOCUMENT_TYPE_LABELS[form.document_type]}`
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
            editing={!!editingId}
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
          <div className="flex gap-2 justify-end print:hidden flex-wrap">
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              ปิด
            </Button>
            <Button variant="secondary" onClick={() => printDocument()}>
              <Printer size={16} /> พิมพ์
            </Button>
            <Button loading={exportingPdf} onClick={handleExportPdf}>
              <FileDown size={16} /> Export PDF
            </Button>
          </div>
          <div
            id="document-print-area"
            className="rounded-xl overflow-hidden border border-zinc-300 max-h-[65vh] overflow-y-auto"
          >
            {previewData && (
              <div id="document-pdf-root">
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
              </div>
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
          <input
            type="text"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm"
            placeholder="ช่องทางชำระ"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
          />
          <Button type="submit" className="w-full">
            บันทึก
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!convertModal}
        onClose={() => {
          setConvertModal(null);
          setDbError("");
        }}
        title="ชำระครบแล้ว — สร้างใบเสร็จ?"
      >
        {convertModal && (
          <div className="space-y-4">
            {dbError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {dbError}
              </div>
            )}
            <p className="text-sm text-muted">
              {convertModal.title} · ฿{convertModal.total_amount.toLocaleString()}
              <br />
              ต้องการสร้างใบเสร็จรับเงินจากใบแจ้งหนี้นี้หรือไม่?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                loading={saving}
                onClick={() => openReceiptFromInvoice(convertModal)}
                className="w-full"
              >
                <Receipt size={16} /> สร้างใบเสร็จทันที
              </Button>
              <Button
                variant="secondary"
                onClick={() => openReceiptFromInvoice(convertModal, true)}
                className="w-full"
              >
                แก้ไขก่อนบันทึก
              </Button>
              <Button variant="secondary" onClick={() => setConvertModal(null)} className="w-full">
                ข้าม
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
