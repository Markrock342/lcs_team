"use client";

import { Building2, Wallet } from "lucide-react";
import { Button, Input, Textarea, Avatar } from "@/components/ui";
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
  currentUserId: string | null;
  slipFile: File | null;
  saving: boolean;
  onChange: (form: QuickPayoutFormData) => void;
  onSlipChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function QuickPayoutForm({
  form,
  members,
  currentUserId,
  slipFile,
  saving,
  onChange,
  onSlipChange,
  onSubmit,
}: Props) {
  const otherMembers = members.filter((m) => m.id !== currentUserId);
  const selectedPayee = members.find((m) => m.id === form.payee_id);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-2">โอนให้ใคร?</p>
        <div className="grid grid-cols-2 gap-2">
          {otherMembers.map((m) => {
            const active = form.payee_id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange({ ...form, payee_id: m.id })}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors touch-manipulation ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-accent/30"
                }`}
              >
                <Avatar name={m.display_name} src={m.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.display_name}</p>
                  <p className="text-[10px] text-muted truncate">
                    {hasBankInfo(m) ? m.bank_name : "ยังไม่มีบัญชี"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedPayee && hasBankInfo(selectedPayee) && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm">
          <p className="text-xs font-medium text-emerald-300 flex items-center gap-1 mb-1">
            <Building2 size={14} /> คัดลอกเลขบัญชีนี้
          </p>
          <p className="font-mono text-base tracking-wide">
            {selectedPayee.bank_account_number}
          </p>
          <p className="text-muted text-xs mt-0.5">
            {selectedPayee.bank_name} · {selectedPayee.bank_account_name}
          </p>
        </div>
      )}

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
        label="ค่าอะไร"
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder="เช่น ค่าจ้างออกแบบ, ค่า dev"
        required
      />

      <Input
        label="วันที่โอน"
        type="date"
        value={form.paid_at}
        onChange={(e) => onChange({ ...form, paid_at: e.target.value })}
        required
      />

      <div>
        <p className="text-sm font-medium mb-1.5">แนบสลิป</p>
        <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/40">
          <Wallet size={20} className="text-muted" />
          <span className="text-sm text-muted">
            {slipFile ? slipFile.name : "แตะเลือกรูปสลิป"}
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

      <Button
        type="submit"
        loading={saving}
        disabled={!form.payee_id}
        className="w-full"
      >
        บันทึกการโอน
      </Button>
    </form>
  );
}
