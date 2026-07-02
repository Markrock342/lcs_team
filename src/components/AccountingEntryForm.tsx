"use client";

import { Wallet } from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { AccountingCategorySelect } from "@/components/AccountingCategorySelect";
import type {
  AccountingCategory,
  AccountingEntryType,
} from "@/lib/extras-types";
import type { Client, Profile } from "@/lib/types";

export type AccountingEntryFormData = {
  type: AccountingEntryType;
  amount: string;
  transaction_date: string;
  category_slug: string;
  description: string;
  member_id: string;
  client_id: string;
  vat_amount: string;
  notes: string;
};

type Props = {
  form: AccountingEntryFormData;
  categories: AccountingCategory[];
  members: Profile[];
  clients: Client[];
  slipFile: File | null;
  saving: boolean;
  editing?: boolean;
  existingSlipUrl?: string | null;
  existingSlipFileName?: string | null;
  onChange: (form: AccountingEntryFormData) => void;
  onSlipChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  defaultCategoryForType: (type: AccountingEntryType) => string;
};

export function AccountingEntryForm({
  form,
  categories,
  members,
  clients,
  slipFile,
  saving,
  editing = false,
  existingSlipUrl,
  existingSlipFileName,
  onChange,
  onSlipChange,
  onSubmit,
  defaultCategoryForType,
}: Props) {
  function setType(type: AccountingEntryType) {
    onChange({
      ...form,
      type,
      category_slug: defaultCategoryForType(type),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["income", "expense"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setType(type)}
            className={`py-2.5 rounded-xl border text-sm font-medium transition-colors touch-manipulation ${
              form.type === type
                ? type === "income"
                  ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-400 bg-rose-500/10 text-rose-300"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {type === "income" ? "รายรับ" : "รายจ่าย"}
          </button>
        ))}
      </div>

      <AccountingCategorySelect
        categories={categories}
        type={form.type}
        value={form.category_slug}
        onChange={(category_slug) => onChange({ ...form, category_slug })}
      />

      <Input
        label="จำนวนเงิน (บาท)"
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        value={form.amount}
        onChange={(e) => onChange({ ...form, amount: e.target.value })}
        required
      />

      <Input
        label="รายการ"
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder={form.type === "income" ? "เช่น รายรับอื่นๆ" : "เช่น ค่าโปรแกรมรายเดือน"}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="วันที่"
          type="date"
          value={form.transaction_date}
          onChange={(e) => onChange({ ...form, transaction_date: e.target.value })}
          required
        />
        <Input
          label="VAT (ถ้ามี)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={form.vat_amount}
          onChange={(e) => onChange({ ...form, vat_amount: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="สมาชิกที่เกี่ยวข้อง"
          value={form.member_id}
          onChange={(e) => onChange({ ...form, member_id: e.target.value })}
        >
          <option value="">ไม่ระบุ</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name}
            </option>
          ))}
        </Select>
        <Select
          label="ลูกค้าที่เกี่ยวข้อง"
          value={form.client_id}
          onChange={(e) => onChange({ ...form, client_id: e.target.value })}
        >
          <option value="">ไม่ระบุ</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <p className="text-sm font-medium mb-1.5">แนบหลักฐาน (ไม่บังคับ)</p>
        <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/40">
          <Wallet size={20} className="text-muted" />
          <span className="text-sm text-muted truncate">
            {slipFile
              ? slipFile.name
              : existingSlipUrl
                ? existingSlipFileName ?? "มีไฟล์เดิม — แตะเลือกใหม่"
                : "แตะเลือกรูปหรือ PDF"}
          </span>
          <input
            type="file"
            accept="image/*,.pdf,image/heic,image/heif"
            className="hidden"
            onChange={(e) => onSlipChange(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <Textarea
        label="หมายเหตุ (ไม่บังคับ)"
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        rows={2}
      />

      <Button type="submit" loading={saving} className="w-full">
        {editing ? "บันทึกการแก้ไข" : "บันทึกรายการบัญชี"}
      </Button>
    </form>
  );
}
