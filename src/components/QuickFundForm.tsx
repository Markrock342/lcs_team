"use client";

import { PiggyBank, Wallet } from "lucide-react";
import { Avatar, Button, Input, Textarea } from "@/components/ui";
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
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-2">ใครจ่ายเข้ากองกลาง?</p>
        <div className="grid grid-cols-2 gap-2">
          {members.map((m) => {
            const active = form.contributor_id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange({ ...form, contributor_id: m.id })}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors touch-manipulation ${
                  active
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-border hover:border-emerald-400/30"
                }`}
              >
                <Avatar name={m.display_name} src={m.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.display_name}</p>
                  <p className="text-[10px] text-muted truncate">@{m.username}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm">
        <p className="text-xs font-medium text-emerald-300 flex items-center gap-1">
          <PiggyBank size={14} /> รายการนี้จะนับเป็นรายรับกองกลาง
        </p>
      </div>

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
        placeholder="เช่น เก็บเงินกองกลาง, เติมเงินทีม"
        required
      />

      <Input
        label="วันที่รับเงิน"
        type="date"
        value={form.paid_at}
        onChange={(e) => onChange({ ...form, paid_at: e.target.value })}
        required
      />

      <div>
        <p className="text-sm font-medium mb-1.5">แนบสลิป (ไม่บังคับ)</p>
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
        disabled={!form.contributor_id}
        className="w-full"
      >
        บันทึกเข้ากองกลาง
      </Button>
    </form>
  );
}
