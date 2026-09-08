"use client";

import { useState } from "react";
import { FileText, Play, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Button,
  Card,
  CardHeader,
  ListRow,
  Modal,
  Select,
  StatusStamp,
} from "@/components/ui";
import { LCSDocumentPreview, printDocument } from "@/components/LCSDocumentPreview";
import { DOCUMENT_KITS, type DocumentKit } from "@/lib/document-kits";
import {
  computeAmountInWords,
  generateDocNumber,
  sumLineItems,
  type AgreementMeta,
  type DocumentFormData,
  type QuotationMeta,
} from "@/lib/invoice-documents";
import { logActivity } from "@/lib/activity";
import type { Client } from "@/lib/types";

function kitItems(kit: DocumentKit) {
  const form = kit.build();
  if (kit.kind === "quotation") {
    const meta = form.document_meta as QuotationMeta;
    return (meta.packages ?? []).map((pack) => ({
      id: pack.code,
      title: `${pack.code} · ${pack.name}${pack.recommended ? " แนะนำ" : ""}`,
      description: pack.suitableFor,
      stamp: `${pack.price.toLocaleString("th-TH")} บาท`,
      tone: pack.recommended ? ("green" as const) : ("slate" as const),
    }));
  }
  const meta = form.document_meta as AgreementMeta;
  return (meta.sections ?? []).map((section) => ({
    id: String(section.no),
    title: `${section.no}. ${section.title}`,
    description: section.body.slice(0, 90),
    stamp: "ข้อตกลง",
    tone: "violet" as const,
  }));
}

export function DocumentKitList({
  kind,
  clients,
}: {
  kind: "quotation" | "agreement";
  clients: Client[];
}) {
  const kits = DOCUMENT_KITS.filter((kit) => kit.kind === kind);
  const [useKit, setUseKit] = useState<DocumentKit | null>(null);
  const [clientId, setClientId] = useState("");
  const [form, setForm] = useState<DocumentFormData | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openUse(kit: DocumentKit) {
    const next = kit.build();
    next.doc_number = generateDocNumber(next.document_type);
    setUseKit(kit);
    setForm(next);
    setClientId("");
    setPreview(false);
    setError("");
  }

  async function saveDocument() {
    if (!form || !useKit) return;
    if (useKit.kind === "quotation" && !clientId) {
      setError("เลือกลูกค้าก่อนออกใบเสนอราคา");
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const subtotal = sumLineItems(form.line_items);
    const payload = {
      client_id: clientId || null,
      title: form.title,
      total_amount: subtotal,
      status: "draft",
      notes: form.notes || null,
      document_type: form.document_type,
      doc_number: form.doc_number,
      issue_date: form.issue_date,
      payment_method: form.payment_method,
      amount_in_words: computeAmountInWords(subtotal),
      vat_amount: 0,
      line_items: form.line_items,
      document_meta: form.document_meta,
      created_by: user?.id ?? null,
    };
    const { error: saveError } = await supabase.from("invoices").insert(payload);
    setSaving(false);
    if (saveError) {
      setError(
        saveError.message.includes("document_type") || saveError.message.includes("check")
          ? "รัน supabase/add-document-kinds.sql ใน Supabase ก่อน"
          : saveError.message
      );
      return;
    }
    await logActivity("create", "invoice", null, form.title, { type: form.document_type, from: useKit.id });
    setPreview(true);
  }

  const selectedClient = clients.find((client) => client.id === clientId) ?? null;

  return (
    <>
      <div className="space-y-6">
        {kits.map((kit) => {
          const items = kitItems(kit);
          return (
            <Card key={kit.id}>
              <CardHeader
                title={kit.name}
                description={kit.description}
                icon={<FileText size={18} className="text-accent" />}
              />
              <div className="divide-y divide-border">
                {items.map((item) => (
                  <ListRow
                    key={item.id}
                    leading={
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-soft text-xs font-semibold tabular-nums">
                        {item.id}
                      </span>
                    }
                    title={item.title}
                    description={item.description}
                    trailing={<StatusStamp label={item.stamp} tone={item.tone} />}
                  />
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                <Button onClick={() => openUse(kit)}>
                  <Play size={16} /> ใช้เทมเพลต
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={Boolean(useKit && form)}
        onClose={() => {
          setUseKit(null);
          setForm(null);
          setPreview(false);
        }}
        title={preview ? `ตัวอย่าง: ${useKit?.name}` : `ใช้เทมเพลต: ${useKit?.name}`}
      >
        {form && !preview && (
          <div className="space-y-4">
            {useKit?.kind === "quotation" ? (
              <Select
                label="ลูกค้า *"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              >
                <option value="">เลือกลูกค้า</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-muted">
                จะสร้างเอกสารข้อตกลงทีมให้พิมพ์และลงนามได้ทันที ไม่ต้องผูกลูกค้า
              </p>
            )}
            {error && <p className="text-sm text-(--status-red-fg)">{error}</p>}
            <Button loading={saving} onClick={() => void saveDocument()} className="w-full">
              สร้างเอกสาร
            </Button>
          </div>
        )}
        {form && preview && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2 print:hidden">
              <Button variant="secondary" onClick={() => printDocument()}>
                <Printer size={16} /> พิมพ์
              </Button>
            </div>
            <div id="document-print-area" className="max-h-[70vh] overflow-auto rounded-xl border border-border">
              <LCSDocumentPreview data={{ ...form, client_id: clientId }} client={selectedClient} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
