"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  ArrowRight,
  Building2,
  ExternalLink,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Modal, Input, Select, Textarea, Avatar } from "@/components/ui";
import { PageHeader, FilterTabs } from "@/components/mobile-ui";
import { logActivity } from "@/lib/activity";
import { sendNotification } from "@/lib/notifications";
import { uploadFile } from "@/lib/upload";
import type { TeamPayout } from "@/lib/extras-types";
import type { Profile } from "@/lib/types";
import { mergeProfileBank, hasBankInfo } from "@/lib/team-banks";
import { format } from "date-fns";
import { th } from "date-fns/locale";

const emptyForm = {
  payee_id: "",
  amount: "",
  description: "",
  paid_at: new Date().toISOString().slice(0, 10),
  notes: "",
};

function formatPaidDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy", { locale: th });
  } catch {
    return iso;
  }
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<TeamPayout[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("history");
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    const [payRes, memRes] = await Promise.all([
      supabase
        .from("team_payouts")
        .select(
          "*, payer:profiles!team_payouts_payer_id_fkey(*), payee:profiles!team_payouts_payee_id_fkey(*)"
        )
        .order("paid_at", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("display_name"),
    ]);

    setPayouts(payRes.data ?? []);
    setMembers((memRes.data ?? []).map(mergeProfileBank));
    setLoading(false);
  }

  const selectedPayee = members.find((m) => m.id === form.payee_id);
  const otherMembers = members.filter((m) => m.id !== currentUserId);

  const filtered = payouts.filter((p) => {
    if (filter === "sent") return p.payer_id === currentUserId;
    if (filter === "received") return p.payee_id === currentUserId;
    return true;
  });

  const totalSent = payouts
    .filter((p) => p.payer_id === currentUserId)
    .reduce((s, p) => s + p.amount, 0);
  const totalReceived = payouts
    .filter((p) => p.payee_id === currentUserId)
    .reduce((s, p) => s + p.amount, 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) return;
    setSaving(true);
    setDbError("");

    const supabase = createClient();
    let slip_url: string | null = null;
    let slip_file_name: string | null = null;

    if (slipFile) {
      const uploaded = await uploadFile(slipFile, "payouts");
      if (!uploaded) {
        setSaving(false);
        setDbError("อัปโหลดสลิปไม่สำเร็จ");
        return;
      }
      slip_url = uploaded.url;
      slip_file_name = slipFile.name;
    }

    const amount = parseFloat(form.amount);
    const payload = {
      payer_id: currentUserId,
      payee_id: form.payee_id,
      amount,
      description: form.description.trim(),
      paid_at: form.paid_at,
      slip_url,
      slip_file_name,
      notes: form.notes.trim() || null,
      created_by: currentUserId,
    };

    const { data: created, error } = await supabase
      .from("team_payouts")
      .insert(payload)
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      if (error.message.includes("relation") || error.message.includes("column")) {
        setDbError("รัน supabase/add-team-payouts.sql ใน Supabase ก่อน");
      } else {
        setDbError(error.message);
      }
      return;
    }

    const payerName =
      members.find((m) => m.id === currentUserId)?.display_name ?? "ทีม";
    await logActivity("create", "payout", created?.id ?? null, form.description, {
      amount,
      payee: selectedPayee?.display_name,
    });

    if (form.payee_id !== currentUserId) {
      await sendNotification({
        userId: form.payee_id,
        title: "💸 ได้รับเงินจากทีม",
        body: `${payerName} โอน ฿${amount.toLocaleString()} — ${form.description}`,
        link: "/payouts",
        kind: "system",
      });
    }

    setModalOpen(false);
    setForm(emptyForm);
    setSlipFile(null);
    load();
  }

  async function deletePayout(p: TeamPayout) {
    if (!confirm(`ลบรายการโอน "${p.description}" ฿${p.amount.toLocaleString()}?`)) return;
    const supabase = createClient();
    await supabase.from("team_payouts").delete().eq("id", p.id);
    load();
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
        title="จ่ายทีม"
        description="โอนจ้างเพื่อนในทีม · แนบสลิป · ตรวจสอบย้อนหลัง"
        action={
          <Button onClick={() => { setModalOpen(true); setDbError(""); }}>
            <Plus size={18} /> บันทึกการโอน
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted">ที่ฉันจ่าย</p>
          <p className="text-xl font-bold text-rose-300 mt-1">
            ฿{totalSent.toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted">ที่ฉันได้รับ</p>
          <p className="text-xl font-bold text-emerald-300 mt-1">
            ฿{totalReceived.toLocaleString()}
          </p>
        </div>
      </div>

      <FilterTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "history", label: "รายการโอน" },
          { key: "accounts", label: "บัญชีทีม" },
        ]}
      />

      {tab === "history" && (
        <>
          <FilterTabs
            active={filter}
            onChange={setFilter}
            tabs={[
              { key: "all", label: "ทั้งหมด", count: payouts.length },
              {
                key: "sent",
                label: "ที่ฉันจ่าย",
                count: payouts.filter((p) => p.payer_id === currentUserId).length,
              },
              {
                key: "received",
                label: "ที่ฉันได้รับ",
                count: payouts.filter((p) => p.payee_id === currentUserId).length,
              },
            ]}
          />

          <div className="space-y-3">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className="flex flex-col sm:flex-row gap-3 sm:items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-medium">{p.payer?.display_name}</span>
                      <ArrowRight size={14} className="text-muted shrink-0" />
                      <span className="font-medium text-accent">
                        {p.payee?.display_name}
                      </span>
                      <span className="text-xs text-muted">
                        {formatPaidDate(p.paid_at)}
                      </span>
                    </div>
                    <p className="font-semibold mt-2">฿{p.amount.toLocaleString()}</p>
                    <p className="text-sm text-muted mt-0.5">{p.description}</p>
                    {p.notes && (
                      <p className="text-xs text-muted mt-1">หมายเหตุ: {p.notes}</p>
                    )}
                    {p.slip_url && (
                      <a
                        href={p.slip_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 text-xs text-accent hover:underline"
                      >
                        <ExternalLink size={14} />
                        ดูสลิป{p.slip_file_name ? ` (${p.slip_file_name})` : ""}
                      </a>
                    )}
                  </div>
                  {p.slip_url &&
                    /\.(jpe?g|png|webp|gif)$/i.test(p.slip_file_name ?? p.slip_url) && (
                    <a
                      href={p.slip_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 block w-20 h-20 rounded-xl overflow-hidden border border-border bg-background"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.slip_url}
                        alt="สลิป"
                        className="w-full h-full object-cover"
                      />
                    </a>
                  )}
                  {(p.payer_id === currentUserId || p.created_by === currentUserId) && (
                    <button
                      type="button"
                      onClick={() => deletePayout(p)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 self-start"
                      title="ลบ"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted py-12">
                ยังไม่มีรายการ — กด「บันทึกการโอน」
              </p>
            )}
          </div>
        </>
      )}

      {tab === "accounts" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={m.display_name} src={m.avatar_url} />
                <div>
                  <p className="font-medium">{m.display_name}</p>
                  <p className="text-xs text-muted">@{m.username}</p>
                </div>
              </div>
              {hasBankInfo(m) ? (
                <div className="text-sm space-y-1 bg-background/60 rounded-xl p-3 border border-border">
                  <p>
                    <span className="text-muted">ธนาคาร:</span> {m.bank_name}
                  </p>
                  <p>
                    <span className="text-muted">เลขบัญชี:</span>{" "}
                    <span className="font-mono">{m.bank_account_number}</span>
                  </p>
                  <p>
                    <span className="text-muted">ชื่อบัญชี:</span>{" "}
                    {m.bank_account_name}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  ยังไม่ได้ตั้งบัญชี — ไปที่ ตั้งค่า → บัญชีรับเงิน
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSlipFile(null);
        }}
        title="บันทึกการโอนให้ทีม"
      >
        {dbError && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {dbError}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Select
            label="โอนให้ *"
            value={form.payee_id}
            onChange={(e) => setForm({ ...form, payee_id: e.target.value })}
            required
          >
            <option value="">เลือกสมาชิกทีม</option>
            {otherMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {!hasBankInfo(m) ? " (ยังไม่มีบัญชี)" : ""}
              </option>
            ))}
          </Select>

          {selectedPayee && hasBankInfo(selectedPayee) && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm space-y-1">
              <p className="text-xs font-medium text-emerald-300 flex items-center gap-1">
                <Building2 size={14} /> บัญชีปลายทาง
              </p>
              <p>{selectedPayee.bank_name}</p>
              <p className="font-mono">{selectedPayee.bank_account_number}</p>
              <p>{selectedPayee.bank_account_name}</p>
            </div>
          )}

          {selectedPayee && !hasBankInfo(selectedPayee) && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              สมาชิกคนนี้ยังไม่ได้ใส่บัญชี — โอนได้แต่ควรให้ไปตั้งค่าก่อน
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="จำนวนเงิน (บาท) *"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
            <Input
              label="วันที่โอน *"
              type="date"
              value={form.paid_at}
              onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
              required
            />
          </div>

          <Input
            label="ค่าอะไร / รายละเอียด *"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="เช่น ค่าจ้างออกแบบหน้า Home, ค่า dev API"
            required
          />

          <Textarea
            label="หมายเหตุ (ถ้ามี)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />

          <div>
            <p className="text-sm font-medium mb-1.5">แนบสลิปโอนเงิน</p>
            <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/40 transition-colors">
              <Wallet size={24} className="text-muted" />
              <span className="text-sm text-muted text-center">
                {slipFile ? slipFile.name : "แตะเพื่อเลือกรูปสลิป / PDF"}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <Button type="submit" loading={saving} className="w-full">
            บันทึกการโอน
          </Button>
        </form>
      </Modal>
    </div>
  );
}
