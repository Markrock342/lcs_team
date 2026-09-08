"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Phone,
  Mail,
  CalendarClock,
  Handshake,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Button,
  Modal,
  Input,
  Select,
  Textarea,
  EmptyState,
  Avatar,
} from "@/components/ui";
import { PageHeader } from "@/components/mobile-ui";
import { useRole } from "@/components/RoleProvider";
import {
  SALES_STAGE_COLORS,
  SALES_STAGE_LABELS,
  SALES_STAGES,
} from "@/lib/constants";
import { logActivity } from "@/lib/activity";
import type { Client, Profile, SalesDeal, SalesStage } from "@/lib/types";

const emptyDeal = {
  title: "",
  client_id: "",
  company: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  value: "",
  stage: "lead" as SalesStage,
  owner_id: "",
  notes: "",
  next_follow_up: "",
};

function money(value: number | null) {
  if (value == null) return "—";
  return `฿${value.toLocaleString()}`;
}

export default function SalesPage() {
  const { canEdit, profile } = useRole();
  const [deals, setDeals] = useState<SalesDeal[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalesDeal | null>(null);
  const [form, setForm] = useState(emptyDeal);
  const [saving, setSaving] = useState(false);
  const [mobileStage, setMobileStage] = useState<SalesStage | "all">("all");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const [dealsRes, clientsRes, profilesRes] = await Promise.all([
      supabase
        .from("sales_deals")
        .select(
          "*, client:clients(*), owner:profiles!sales_deals_owner_id_fkey(*)"
        )
        .order("updated_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
      supabase.from("profiles").select("*").order("display_name"),
    ]);
    setDeals((dealsRes.data as SalesDeal[]) ?? []);
    setClients(clientsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    if (dealsRes.error) {
      setLoadError(
        dealsRes.error.message.includes("sales_deals")
          ? "ยังไม่ได้สร้างตารางขาย — รันไฟล์ supabase/add-sales-department.sql ใน Supabase SQL Editor"
          : dealsRes.error.message
      );
    } else {
      setLoadError("");
    }
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyDeal,
      owner_id: profile?.id ?? "",
    });
    setModalOpen(true);
  }

  function openEdit(deal: SalesDeal) {
    setEditing(deal);
    setForm({
      title: deal.title,
      client_id: deal.client_id ?? "",
      company: deal.company ?? "",
      contact_name: deal.contact_name ?? "",
      contact_phone: deal.contact_phone ?? "",
      contact_email: deal.contact_email ?? "",
      value: deal.value != null ? String(deal.value) : "",
      stage: deal.stage,
      owner_id: deal.owner_id ?? "",
      notes: deal.notes ?? "",
      next_follow_up: deal.next_follow_up ?? "",
    });
    setModalOpen(true);
  }

  async function saveDeal() {
    if (!form.title.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      title: form.title.trim(),
      client_id: form.client_id || null,
      company: form.company.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      value: form.value ? Number(form.value) : null,
      stage: form.stage,
      owner_id: form.owner_id || null,
      notes: form.notes.trim() || null,
      next_follow_up: form.next_follow_up || null,
      created_by: profile?.id ?? null,
    };

    if (editing) {
      const { error } = await supabase
        .from("sales_deals")
        .update(payload)
        .eq("id", editing.id);
      if (!error) {
        await logActivity("update", "sales_deal", editing.id, form.title);
      }
    } else {
      const { data, error } = await supabase
        .from("sales_deals")
        .insert(payload)
        .select("id")
        .single();
      if (!error && data) {
        await logActivity("create", "sales_deal", data.id, form.title);
      }
    }

    setSaving(false);
    setModalOpen(false);
    await load();
  }

  async function moveDeal(deal: SalesDeal, stage: SalesStage) {
    if (!canEdit || deal.stage === stage) return;
    const supabase = createClient();
    await supabase.from("sales_deals").update({ stage }).eq("id", deal.id);
    setDeals((prev) =>
      prev.map((item) => (item.id === deal.id ? { ...item, stage } : item))
    );
    await logActivity("update", "sales_deal", deal.id, deal.title, { stage });
  }

  async function deleteDeal(deal: SalesDeal) {
    if (!canEdit) return;
    if (!confirm(`ลบดีล “${deal.title}” หรือไม่?`)) return;
    const supabase = createClient();
    await supabase.from("sales_deals").delete().eq("id", deal.id);
    await logActivity("delete", "sales_deal", deal.id, deal.title);
    setDeals((prev) => prev.filter((item) => item.id !== deal.id));
  }

  const pipelineValue = deals
    .filter((d) => d.stage !== "lost")
    .reduce((sum, d) => sum + (d.value ?? 0), 0);
  const openCount = deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length;
  const wonCount = deals.filter((d) => d.stage === "won").length;

  const visibleStages = useMemo(
    () =>
      mobileStage === "all"
        ? SALES_STAGES
        : SALES_STAGES.filter((stage) => stage === mobileStage),
    [mobileStage]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="งานขาย"
        description="ติดตามลีดจนปิดการขาย — ย้ายการ์ดตามสถานะที่คุยกับลูกค้า"
        action={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus size={18} /> เพิ่มดีล
            </Button>
          ) : undefined
        }
      />

      {loadError && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="ticket-card p-3 sm:p-4">
          <p className="text-xs text-muted">ดีลที่กำลังคุย</p>
          <p className="text-xl font-semibold mt-1">{openCount}</p>
        </div>
        <div className="ticket-card p-3 sm:p-4">
          <p className="text-xs text-muted">มูลค่าในท่อ</p>
          <p className="text-xl font-semibold mt-1">{money(pipelineValue)}</p>
        </div>
        <div className="ticket-card p-3 sm:p-4">
          <p className="text-xs text-muted">ปิดได้แล้ว</p>
          <p className="text-xl font-semibold mt-1 text-emerald-300">{wonCount}</p>
        </div>
      </div>

      <div className="lg:hidden">
        <Select
          label="ดูตามสถานะ"
          value={mobileStage}
          onChange={(e) => setMobileStage(e.target.value as SalesStage | "all")}
        >
          <option value="all">ทุกสถานะ</option>
          {SALES_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {SALES_STAGE_LABELS[stage]}
            </option>
          ))}
        </Select>
      </div>

      {deals.length === 0 ? (
        <EmptyState
          icon={<Handshake size={28} />}
          title="ยังไม่มีดีล"
          description="เพิ่มลีดแรก แล้วลากสถานะตามที่คุยกับลูกค้า"
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {visibleStages.map((stage) => {
            const column = deals.filter((d) => d.stage === stage);
            const total = column.reduce((sum, d) => sum + (d.value ?? 0), 0);
            return (
              <section
                key={stage}
                className="ticket-card min-w-[260px] flex-1 p-3 space-y-2"
              >
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-sm font-semibold">
                    {SALES_STAGE_LABELS[stage]}
                    <span className="text-muted font-normal ml-1.5">
                      {column.length}
                    </span>
                  </h2>
                  {total > 0 && (
                    <p className="text-xs text-muted">{money(total)}</p>
                  )}
                </div>
                <div className="space-y-2 min-h-[4rem]">
                  {column.map((deal) => (
                    <article
                      key={deal.id}
                      className="rounded-xl border border-border bg-background p-3 space-y-2"
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(deal)}
                        className="w-full text-left"
                      >
                        <p className="font-medium text-sm leading-snug">
                          {deal.title}
                        </p>
                        <p className="text-xs text-muted mt-0.5 truncate">
                          {deal.client?.name ?? deal.company ?? "ยังไม่ผูกลูกค้า"}
                        </p>
                      </button>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{money(deal.value)}</p>
                        {deal.owner && (
                          <Avatar
                            name={deal.owner.display_name}
                            src={deal.owner.avatar_url}
                            size="sm"
                          />
                        )}
                      </div>
                      {(deal.contact_phone || deal.next_follow_up) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                          {deal.contact_phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone size={11} /> {deal.contact_phone}
                            </span>
                          )}
                          {deal.next_follow_up && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock size={11} /> {deal.next_follow_up}
                            </span>
                          )}
                        </div>
                      )}
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <select
                            value={deal.stage}
                            onChange={(e) =>
                              moveDeal(deal, e.target.value as SalesStage)
                            }
                            className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-[11px] bg-card ${SALES_STAGE_COLORS[deal.stage]}`}
                          >
                            {SALES_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {SALES_STAGE_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => deleteDeal(deal)}
                            className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10"
                            aria-label="ลบดีล"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "แก้ดีล" : "เพิ่มดีล"}
      >
        <div className="space-y-3">
          <Input
            label="ชื่องาน / ดีล"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="เว็บร้านค้า ABC"
            required
          />
          <Select
            label="ลูกค้าในระบบ"
            value={form.client_id}
            onChange={(e) => {
              const client = clients.find((c) => c.id === e.target.value);
              setForm({
                ...form,
                client_id: e.target.value,
                company: client?.company ?? form.company,
                contact_name: client?.contact_name ?? form.contact_name,
                contact_phone: client?.contact_phone ?? form.contact_phone,
                contact_email: client?.contact_email ?? form.contact_email,
              });
            }}
          >
            <option value="">ยังไม่ผูก</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="บริษัท"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
            <Input
              label="ผู้ติดต่อ"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="เบอร์โทร"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
            <Input
              label="อีเมล"
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="มูลค่าโดยประมาณ"
              type="number"
              min="0"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="0"
            />
            <Input
              label="นัดติดตาม"
              type="date"
              value={form.next_follow_up}
              onChange={(e) =>
                setForm({ ...form, next_follow_up: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="สถานะ"
              value={form.stage}
              onChange={(e) =>
                setForm({ ...form, stage: e.target.value as SalesStage })
              }
            >
              {SALES_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {SALES_STAGE_LABELS[stage]}
                </option>
              ))}
            </Select>
            <Select
              label="ผู้รับผิดชอบ"
              value={form.owner_id}
              onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
            >
              <option value="">ยังไม่กำหนด</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="หมายเหตุ"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex gap-2 pt-2">
            <Button onClick={saveDeal} loading={saving} className="flex-1">
              บันทึก
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              ยกเลิก
            </Button>
          </div>
          {form.contact_email && (
            <p className="text-xs text-muted inline-flex items-center gap-1">
              <Mail size={12} /> {form.contact_email}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
