"use client";

import { Button, Input, Select, Textarea } from "@/components/ui";
import {
  AmountField,
  ChoiceChips,
  FormActions,
  FormDisclosure,
  SlipField,
} from "@/components/form-ui";
import { formatBaht } from "@/lib/money";
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

  const amount = parseFloat(form.amount);
  const validAmount = Number.isFinite(amount) && amount > 0;
  const hasExtra =
    !!form.member_id || !!form.client_id || !!form.notes || (parseFloat(form.vat_amount) || 0) > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <ChoiceChips
        label="ประเภทรายการ"
        columns={2}
        value={form.type}
        onChange={setType}
        options={[
          { value: "income", label: "เงินเข้า (รายรับ)", tone: "green" },
          { value: "expense", label: "เงินออก (รายจ่าย)", tone: "red" },
        ]}
      />

      <AmountField
        label="จำนวนเงิน"
        tone={form.type === "income" ? "income" : "expense"}
        value={form.amount}
        onChange={(amount) => onChange({ ...form, amount })}
      />

      <Input
        label="รายการ"
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder={form.type === "income" ? "เช่น รายรับอื่นๆ" : "เช่น ค่าโปรแกรมรายเดือน"}
        enterKeyHint="next"
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AccountingCategorySelect
          categories={categories}
          type={form.type}
          value={form.category_slug}
          onChange={(category_slug) => onChange({ ...form, category_slug })}
        />
        <Input
          label="วันที่"
          type="date"
          value={form.transaction_date}
          onChange={(e) => onChange({ ...form, transaction_date: e.target.value })}
          required
        />
      </div>

      <SlipField
        label="หลักฐาน (ไม่บังคับ)"
        file={slipFile}
        onChange={onSlipChange}
        existingName={existingSlipUrl ? existingSlipFileName ?? "มีไฟล์เดิมแนบอยู่" : null}
        emptyText="แตะเพื่อเลือกรูปหรือ PDF"
      />

      <FormDisclosure
        title="VAT · สมาชิก · ลูกค้า · หมายเหตุ"
        defaultOpen={hasExtra}
      >
        <Input
          label="VAT (บาท)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="0"
          value={form.vat_amount}
          onChange={(e) => onChange({ ...form, vat_amount: e.target.value })}
        />
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
        <Textarea
          label="หมายเหตุ"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          rows={2}
        />
      </FormDisclosure>

      <FormActions
        summary={
          validAmount
            ? `${form.type === "income" ? "เงินเข้า" : "เงินออก"} · ${formatBaht(amount)}`
            : undefined
        }
      >
        <Button type="submit" loading={saving}>
          {editing ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
        </Button>
      </FormActions>
    </form>
  );
}
