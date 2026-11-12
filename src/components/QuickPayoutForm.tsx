"use client";

import { useState } from "react";
import { Building2, Check, Copy } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import {
  AmountField,
  FormActions,
  FormDisclosure,
  PersonPicker,
  SlipField,
} from "@/components/form-ui";
import { formatBaht } from "@/lib/money";
import { hasBankInfo } from "@/lib/team-banks";
import type { Profile } from "@/lib/types";

export type QuickPayoutFormData = {
  payee_id: string;
  amount: string;
  description: string;
  paid_at: string;
  notes: string;
};

type Props = {
  form: QuickPayoutFormData;
  members: Profile[];
  slipFile: File | null;
  saving: boolean;
  onChange: (form: QuickPayoutFormData) => void;
  onSlipChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function QuickPayoutForm({
  form,
  members,
  slipFile,
  saving,
  onChange,
  onSlipChange,
  onSubmit,
}: Props) {
  const [copied, setCopied] = useState(false);
  const selectedPayee = members.find((m) => m.id === form.payee_id);
  const amount = parseFloat(form.amount);
  const validAmount = Number.isFinite(amount) && amount > 0;

  async function copyAccount(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <PersonPicker
        label="โอนให้ใคร"
        value={form.payee_id}
        onChange={(payee_id) => {
          setCopied(false);
          onChange({ ...form, payee_id });
        }}
        people={members.map((m) => ({
          id: m.id,
          name: m.display_name,
          avatarUrl: m.avatar_url,
          detail: hasBankInfo(m) ? (m.bank_name ?? undefined) : "ยังไม่ตั้งบัญชีรับโอน",
          warning: !hasBankInfo(m),
        }))}
      />

      {selectedPayee && hasBankInfo(selectedPayee) && (
        <div className="rounded-2xl bg-surface-soft p-4">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Building2 size={16} /> {selectedPayee.bank_name} · {selectedPayee.bank_account_name}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <p className="min-w-0 flex-1 font-mono text-xl font-semibold tabular-nums wrap-anywhere">
              {selectedPayee.bank_account_number}
            </p>
            <button
              type="button"
              onClick={() => copyAccount(selectedPayee.bank_account_number ?? "")}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-card-hover touch-manipulation"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
        </div>
      )}

      <AmountField
        label="จำนวนเงินที่โอน"
        tone="expense"
        value={form.amount}
        onChange={(amount) => onChange({ ...form, amount })}
      />

      <Input
        label="ค่าอะไร"
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder="เช่น ค่าจ้างออกแบบ, ค่า dev"
        enterKeyHint="next"
        required
      />

      <Input
        label="วันที่โอน"
        type="date"
        value={form.paid_at}
        onChange={(e) => onChange({ ...form, paid_at: e.target.value })}
        required
      />

      <SlipField label="สลิปการโอน" file={slipFile} onChange={onSlipChange} />

      <FormDisclosure title="หมายเหตุ" hint="ไม่บังคับ" defaultOpen={!!form.notes}>
        <Textarea
          aria-label="หมายเหตุ"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          rows={2}
        />
      </FormDisclosure>

      <FormActions
        summary={
          selectedPayee
            ? `โอนให้ ${selectedPayee.display_name}${validAmount ? ` · ${formatBaht(amount)}` : ""}`
            : "เลือกคนรับโอนก่อนบันทึก"
        }
      >
        <Button type="submit" loading={saving} disabled={!form.payee_id}>
          บันทึกการโอน
        </Button>
      </FormActions>
    </form>
  );
}
