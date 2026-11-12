"use client";

import { Button, Input, Textarea } from "@/components/ui";
import {
  AmountField,
  FormActions,
  FormDisclosure,
  PersonPicker,
  SlipField,
} from "@/components/form-ui";
import { formatBaht } from "@/lib/money";
import type { Profile } from "@/lib/types";

export type QuickFundFormData = {
  contributor_id: string;
  amount: string;
  description: string;
  paid_at: string;
  notes: string;
};

type Props = {
  form: QuickFundFormData;
  members: Profile[];
  slipFile: File | null;
  saving: boolean;
  onChange: (form: QuickFundFormData) => void;
  onSlipChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function QuickFundForm({
  form,
  members,
  slipFile,
  saving,
  onChange,
  onSlipChange,
  onSubmit,
}: Props) {
  const contributor = members.find((m) => m.id === form.contributor_id);
  const amount = parseFloat(form.amount);
  const validAmount = Number.isFinite(amount) && amount > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <PersonPicker
        label="ใครจ่าย"
        value={form.contributor_id}
        onChange={(contributor_id) => onChange({ ...form, contributor_id })}
        people={members.map((m) => ({
          id: m.id,
          name: m.display_name,
          avatarUrl: m.avatar_url,
          detail: `@${m.username}`,
        }))}
      />

      <AmountField
        label="จำนวนเงินที่เก็บ"
        tone="income"
        value={form.amount}
        onChange={(amount) => onChange({ ...form, amount })}
      />

      <Input
        label="รายการ"
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder="เช่น เก็บเงินกองกลาง, เติมเงินทีม"
        enterKeyHint="next"
        required
      />

      <Input
        label="วันที่รับเงิน"
        type="date"
        value={form.paid_at}
        onChange={(e) => onChange({ ...form, paid_at: e.target.value })}
        required
      />

      <SlipField label="สลิป (ไม่บังคับ)" file={slipFile} onChange={onSlipChange} />

      <FormDisclosure title="หมายเหตุ" defaultOpen={!!form.notes}>
        <Textarea
          aria-label="หมายเหตุ"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          rows={2}
        />
      </FormDisclosure>

      <FormActions
        summary={
          contributor
            ? `${contributor.display_name} จ่ายเข้ากองกลาง${validAmount ? ` · ${formatBaht(amount)}` : ""}`
            : undefined
        }
      >
        <Button type="submit" loading={saving} disabled={!form.contributor_id}>
          บันทึกเข้ากองกลาง
        </Button>
      </FormActions>
    </form>
  );
}
