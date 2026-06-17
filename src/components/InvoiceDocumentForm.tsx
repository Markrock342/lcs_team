"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import {
  computeAmountInWords,
  emptyLineItem,
  sumLineItems,
  type DocumentFormData,
} from "@/lib/invoice-documents";
import { INVOICE_STATUS_LABELS } from "@/lib/extras-types";
import type { Client } from "@/lib/types";

type Props = {
  form: DocumentFormData;
  clients: Client[];
  saving: boolean;
  editing?: boolean;
  onChange: (form: DocumentFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function InvoiceDocumentForm({
  form,
  clients,
  saving,
  editing = false,
  onChange,
  onSubmit,
}: Props) {
  const subtotal = sumLineItems(form.line_items);
  const vat = parseFloat(form.vat_amount || "0") || 0;
  const total = subtotal + vat;

  function updateLine(i: number, patch: Partial<(typeof form.line_items)[0]>) {
    const line_items = form.line_items.map((item, idx) =>
      idx === i ? { ...item, ...patch } : item
    );
    onChange({ ...form, line_items });
  }

  function addLine() {
    onChange({ ...form, line_items: [...form.line_items, emptyLineItem()] });
  }

  function removeLine(i: number) {
    if (form.line_items.length <= 1) return;
    onChange({
      ...form,
      line_items: form.line_items.filter((_, idx) => idx !== i),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <Select
        label="ลูกค้า *"
        value={form.client_id}
        onChange={(e) => onChange({ ...form, client_id: e.target.value })}
        required
      >
        <option value="">เลือกลูกค้า</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="เลขที่เอกสาร"
          value={form.doc_number}
          onChange={(e) => onChange({ ...form, doc_number: e.target.value })}
        />
        <Input
          label="วันที่"
          type="date"
          value={form.issue_date}
          onChange={(e) => onChange({ ...form, issue_date: e.target.value })}
        />
      </div>

      <Input
        label="หัวข้อ / ชื่อโครงการ *"
        value={form.title}
        onChange={(e) => onChange({ ...form, title: e.target.value })}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="สถานะ"
          value={form.status}
          onChange={(e) => onChange({ ...form, status: e.target.value })}
        >
          {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input
          label="ช่องทางชำระ"
          value={form.payment_method}
          onChange={(e) => onChange({ ...form, payment_method: e.target.value })}
        />
      </div>

      {form.document_type === "invoice" && (
        <Input
          label="ครบกำหนดชำระ"
          type="date"
          value={form.due_date}
          onChange={(e) => onChange({ ...form, due_date: e.target.value })}
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">รายการ</p>
          <button
            type="button"
            onClick={addLine}
            className="text-xs text-accent flex items-center gap-1"
          >
            <Plus size={14} /> เพิ่มแถว
          </button>
        </div>
        {form.line_items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-12 gap-2 items-end bg-background/50 p-2 rounded-xl border border-border"
          >
            <div className="col-span-12 sm:col-span-5">
              <Input
                label={i === 0 ? "รายการ" : undefined}
                value={item.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="ค่าพัฒนาโปรแกรม"
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input
                label={i === 0 ? "จำนวน" : undefined}
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) =>
                  updateLine(i, { quantity: parseFloat(e.target.value) || 1 })
                }
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input
                label={i === 0 ? "หน่วย" : undefined}
                value={item.unit}
                onChange={(e) => updateLine(i, { unit: e.target.value })}
              />
            </div>
            <div className="col-span-3 sm:col-span-2">
              <Input
                label={i === 0 ? "ราคา" : undefined}
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice || ""}
                onChange={(e) =>
                  updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="col-span-1 flex justify-end pb-2">
              <button
                type="button"
                onClick={() => removeLine(i)}
                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <p className="text-sm text-right text-muted">
          ยอดรวม <span className="text-accent font-semibold">฿{total.toLocaleString()}</span>
        </p>
      </div>

      {form.document_type !== "proposal" && (
        <>
          <Input
            label="VAT (บาท)"
            type="number"
            min="0"
            value={form.vat_amount}
            onChange={(e) => onChange({ ...form, vat_amount: e.target.value })}
          />
          <Input
            label="จำนวนเงินตัวอักษร"
            value={computeAmountInWords(total)}
            readOnly
            className="opacity-80"
          />
        </>
      )}

      <Textarea
        label="หมายเหตุ"
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        rows={3}
        className="min-h-[4rem] resize-y"
      />

      <Button type="submit" loading={saving} className="w-full">
        {editing ? "บันทึกการแก้ไข" : "บันทึกเอกสาร"}
      </Button>
    </form>
  );
}
