"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Phone,
  Mail,
  CalendarClock,
  Handshake,
  CircleDollarSign,
  Trophy,
  Trash2,
  Upload,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardHeader,
  Button,
  Modal,
  Input,
  Select,
  Textarea,
  EmptyState,
  ErrorState,
  MetricTile,
  PageLoader,
  SalesStageBadge,
  Avatar,
  StatusStamp,
} from "@/components/ui";
import { FilterTabs, PageHeader, PageShell } from "@/components/mobile-ui";
import { useRole } from "@/components/RoleProvider";
import {
  PROSPECT_STATUS_COLORS,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUSES,
  SALES_STAGE_LABELS,
  SALES_STAGES,
} from "@/lib/constants";
import { logActivity } from "@/lib/activity";
import { PLAYBOOK } from "@/lib/sales-playbook";
import { createClientFromWonDeal } from "@/lib/workspace-automation";
import { ProspectImportWizard } from "@/components/workspace/ProspectImportWizard";
import { ProspectDrawer } from "@/components/workspace/ProspectDrawer";
import { SavedViewsBar } from "@/components/workspace/SavedViewsBar";
import { useActionFeedback } from "@/components/workspace/ActionFeedback";
import { readLastFilters, writeLastFilters } from "@/lib/saved-views";
import type { MappedProspect } from "@/lib/prospect-import";
import type {
  Client,
  Profile,
  ProspectStatus,
  SalesDeal,
  SalesProspect,
  SalesStage,
} from "@/lib/types";

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

const stageSurface: Record<SalesStage, string> = {
  lead: "bg-[var(--status-blue-bg)]",
  talking: "bg-[var(--status-amber-bg)]",
  quoted: "bg-[var(--status-violet-bg)]",
  won: "bg-[var(--status-green-bg)]",
  lost: "bg-[var(--status-red-bg)]",
};

function toneFromClass(value: string) {
  return value.replace("status-", "") as "slate" | "blue" | "amber" | "violet" | "green" | "red";
}

function SalesPageInner() {
  const { canEdit, profile } = useRole();
  const { toast, setSaving } = useActionFeedback();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deals, setDeals] = useState<SalesDeal[]>([]);
  const [prospects, setProspects] = useState<SalesProspect[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [editing, setEditing] = useState<SalesDeal | null>(null);
  const [form, setForm] = useState(emptyDeal);
  const [saving, setFormSaving] = useState(false);
  const [mobileStage, setMobileStage] = useState<SalesStage | "all">("all");
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<"prospects" | "today" | "pipeline">(() => {
    if (typeof window === "undefined") return "prospects";
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    if (fromUrl === "today" || fromUrl === "pipeline" || fromUrl === "prospects") return fromUrl;
    const saved = readLastFilters("sales").view;
    if (saved === "today" || saved === "pipeline" || saved === "prospects") return saved;
    return "prospects";
  });
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "all">(() => {
    if (typeof window === "undefined") return "all";
    const saved = readLastFilters("sales").status;
    return saved && saved !== "all" ? (saved as ProspectStatus) : "all";
  });
  const [openProspect, setOpenProspect] = useState<SalesProspect | null>(null);

  useEffect(() => {
    const nextView = searchParams.get("view");
    // URL drives the selected sales work view after client navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nextView === "today" || nextView === "pipeline" || nextView === "prospects") setView(nextView);
    if (searchParams.get("import") === "1") setImportOpen(true);
    if (searchParams.get("create") === "deal") {
      setEditing(null);
      setForm({ ...emptyDeal, owner_id: profile?.id ?? "" });
      setModalOpen(true);
    }
  }, [searchParams, profile?.id]);

  useEffect(() => {
    writeLastFilters("sales", { view, status: statusFilter });
  }, [view, statusFilter]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const supabase = createClient();
    const [dealsRes, clientsRes, profilesRes, prospectsRes] = await Promise.all([
      supabase
        .from("sales_deals")
        .select("*, client:clients(*), owner:profiles!sales_deals_owner_id_fkey(*)")
        .order("updated_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
      supabase.from("profiles").select("*").order("display_name"),
      supabase
        .from("sales_prospects")
        .select("*, owner:profiles(*)")
        .order("updated_at", { ascending: false }),
    ]);
    setDeals((dealsRes.data as SalesDeal[]) ?? []);
    setClients(clientsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setProspects((prospectsRes.data as SalesProspect[]) ?? []);
    const errors = [dealsRes.error, prospectsRes.error].filter(Boolean);
    if (errors.length) {
      const message = errors[0]?.message ?? "";
      setLoadError(
        message.includes("sales_")
          ? "ยังไม่ได้สร้างตารางขาย — รัน supabase/add-sales-department.sql และ add-sales-productivity.sql"
          : message
      );
    } else {
      setLoadError("");
    }
    setLoading(false);

    const openId = searchParams.get("open");
    if (openId && prospectsRes.data) {
      const found = (prospectsRes.data as SalesProspect[]).find((item) => item.id === openId);
      if (found) setOpenProspect(found);
    }
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
    setFormSaving(true);
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
      const { error } = await supabase.from("sales_deals").update(payload).eq("id", editing.id);
      if (!error) await logActivity("update", "sales_deal", editing.id, form.title);
    } else {
      const { data, error } = await supabase.from("sales_deals").insert(payload).select("id").single();
      if (!error && data) await logActivity("create", "sales_deal", data.id, form.title);
    }

    setFormSaving(false);
    setModalOpen(false);
    toast("บันทึกดีลแล้ว");
    await load();
  }

  async function moveDeal(deal: SalesDeal, stage: SalesStage) {
    if (!canEdit || deal.stage === stage) return;
    const previous = deal.stage;
    const supabase = createClient();
    await supabase.from("sales_deals").update({ stage }).eq("id", deal.id);
    setDeals((prev) => prev.map((item) => (item.id === deal.id ? { ...item, stage } : item)));
    await logActivity("update", "sales_deal", deal.id, deal.title, { stage });
    if (stage === "won") {
      const result = await createClientFromWonDeal({ ...deal, stage });
      if (result.error) toast(result.error);
    }
    toast(`ย้ายเป็น${SALES_STAGE_LABELS[stage]}`, async () => {
      await supabase.from("sales_deals").update({ stage: previous }).eq("id", deal.id);
      await load();
    });
  }

  async function deleteDeal(deal: SalesDeal) {
    if (!canEdit) return;
    if (!confirm(`ลบดีล “${deal.title}” หรือไม่?`)) return;
    const supabase = createClient();
    await supabase.from("sales_deals").delete().eq("id", deal.id);
    await logActivity("delete", "sales_deal", deal.id, deal.title);
    setDeals((prev) => prev.filter((item) => item.id !== deal.id));
    toast("ลบดีลแล้ว", async () => {
      await supabase.from("sales_deals").insert({
        id: deal.id,
        title: deal.title,
        client_id: deal.client_id,
        company: deal.company,
        contact_name: deal.contact_name,
        contact_phone: deal.contact_phone,
        contact_email: deal.contact_email,
        value: deal.value,
        stage: deal.stage,
        owner_id: deal.owner_id,
        notes: deal.notes,
        next_follow_up: deal.next_follow_up,
        created_by: deal.created_by,
      });
      await load();
    });
  }

  async function importProspects(rows: MappedProspect[], ownerId: string | null) {
    setSaving(true);
    const supabase = createClient();
    const batch = new Date().toISOString();
    const seen = new Set(prospects.map((item) => item.external_key).filter(Boolean) as string[]);
    const unique: MappedProspect[] = [];
    for (const row of rows) {
      if (seen.has(row.external_key)) continue;
      seen.add(row.external_key);
      unique.push(row);
    }
    if (!unique.length) {
      setSaving(false);
      return "ทุกรายชื่อซ้ำกับที่มีอยู่แล้ว";
    }
    const { error } = await supabase.from("sales_prospects").insert(
      unique.map((row) => ({
        ...row,
        extra: Object.keys(row.extra).length ? row.extra : null,
        owner_id: ownerId,
        status: ownerId ? "assigned" : "new",
        source: "excel",
        import_batch_id: batch,
        created_by: profile?.id ?? null,
      }))
    );
    setSaving(false);
    if (error) return error.message;
    const skipped = rows.length - unique.length;
    toast(skipped ? `นำเข้า ${unique.length} รายชื่อ (ข้ามซ้ำ ${skipped})` : `นำเข้า ${unique.length} รายชื่อ`);
    await load();
    router.replace("/sales?view=prospects");
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const followUps = useMemo(
    () =>
      [
        ...prospects.filter(
          (item) =>
            item.next_follow_up &&
            item.next_follow_up <= today &&
            item.status !== "converted" &&
            item.status !== "not_interested"
        ),
        ...deals.filter(
          (item) =>
            item.next_follow_up &&
            item.next_follow_up <= today &&
            item.stage !== "won" &&
            item.stage !== "lost"
        ),
      ].sort((a, b) => (a.next_follow_up ?? "").localeCompare(b.next_follow_up ?? "")),
    [prospects, deals, today]
  );
  const visibleProspects = prospects.filter(
    (item) => statusFilter === "all" || item.status === statusFilter
  );
  const pipelineValue = deals.filter((d) => d.stage !== "lost").reduce((sum, d) => sum + (d.value ?? 0), 0);
  const openCount = deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length;
  const wonCount = deals.filter((d) => d.stage === "won").length;

  if (loading) return <PageLoader label="กำลังโหลดงานขาย..." />;

  return (
    <PageShell width="full">
      <PageHeader
        title="แผนกขาย"
        description="รายชื่อเป้าหมาย ติดตามวันนี้ และท่อขาย — ผู้ช่วย Gemini ร่างข้อความให้ ต้องกดยืนยันเอง"
        action={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setPlaybookOpen(true)}>
                <BookOpen size={18} /> คู่มือคุย
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={18} /> นำเข้า Excel
              </Button>
              <Button onClick={openCreate}>
                <Plus size={18} /> เพิ่มดีล
              </Button>
            </div>
          ) : undefined
        }
      />

      {loadError && <ErrorState description={loadError} onRetry={() => void load()} />}

      <Card>
        <CardHeader
          title="ผู้ช่วย Gemini"
          description="เปิดการ์ดรายชื่อเป้าหมายด้านล่าง แล้วกดร่างอีเมล สคริปต์โทร สรุปการคุย หรืองานถัดไป — ระบบไม่ส่งข้อความแทน"
          icon={<Sparkles size={18} className="text-accent" />}
        />
      </Card>

      <FilterTabs
        active={view}
        onChange={(key) => setView(key as typeof view)}
        tabs={[
          { key: "prospects", label: "รายชื่อเป้าหมาย", count: prospects.length },
          { key: "today", label: "ติดตามวันนี้", count: followUps.length },
          { key: "pipeline", label: "Pipeline", count: deals.length },
        ]}
      />

      <SavedViewsBar
        page="sales"
        filters={{ view, status: statusFilter }}
        onApply={(filters) => {
          if (filters.view === "today" || filters.view === "pipeline" || filters.view === "prospects") {
            setView(filters.view);
          }
          if (filters.status) setStatusFilter(filters.status as ProspectStatus | "all");
        }}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <MetricTile label="เป้าหมาย" value={prospects.filter((p) => p.status !== "converted").length} icon={<Handshake size={18} />} />
        <MetricTile label="ต้องตามวันนี้" value={followUps.length} icon={<CalendarClock size={18} />} />
        <MetricTile label="ดีลที่กำลังคุย" value={openCount} icon={<Trophy size={18} />} />
        <MetricTile label="มูลค่าในท่อ" value={money(pipelineValue)} icon={<CircleDollarSign size={18} />} />
      </div>

      {view === "prospects" && (
        <>
          <Select
            label="กรองสถานะ"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | "all")}
          >
            <option value="all">ทุกสถานะ</option>
            {PROSPECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROSPECT_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          {visibleProspects.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Handshake size={28} />}
                title="ยังไม่มีรายชื่อเป้าหมาย"
                description="นำเข้าไฟล์ Excel รายชื่อสนาม แล้วเปิดการ์ดรายชื่อเพื่อใช้ผู้ช่วย Gemini"
                action={
                  canEdit ? (
                    <Button onClick={() => setImportOpen(true)}>
                      <Upload size={18} /> นำเข้า Excel
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="auto-card-grid">
              {visibleProspects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOpenProspect(item)}
                  className="job-jacket p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="mt-1 text-sm text-muted">
                        {item.contact_name || item.company || "ยังไม่มีผู้ติดต่อ"}
                      </p>
                    </div>
                    <StatusStamp
                      label={PROSPECT_STATUS_LABELS[item.status]}
                      tone={toneFromClass(PROSPECT_STATUS_COLORS[item.status])}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted">
                    {item.contact_phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={14} /> {item.contact_phone}
                      </span>
                    )}
                    {item.contact_email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail size={14} /> {item.contact_email}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm">เปิดการ์ดนี้เพื่อโทร บันทึกการคุย หรือให้ Gemini ร่างข้อความ</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === "today" && (
        <Card>
          <CardHeader title="นัดที่ถึงกำหนด" description="รวมเป้าหมายและดีลที่ต้องติดตามวันนี้หรือค้าง" />
          {followUps.length === 0 ? (
            <EmptyState icon={<CalendarClock size={28} />} title="วันนี้ยังไม่มีนัด" description="เมื่อบันทึกวันติดตาม รายการจะโชว์ที่นี่" />
          ) : (
            <div className="divide-y divide-border">
              {followUps.map((item) => {
                const isDeal = "stage" in item;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-card-hover"
                    onClick={() => {
                      if (isDeal) openEdit(item as SalesDeal);
                      else setOpenProspect(item as SalesProspect);
                    }}
                  >
                    <div>
                      <p className="font-semibold">{"title" in item ? item.title : item.name}</p>
                      <p className="text-sm text-muted">นัด {item.next_follow_up}</p>
                    </div>
                    <span className="text-sm font-semibold text-accent">ทำต่อ</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {view === "pipeline" && (
        deals.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Handshake size={28} />}
              title="ยังไม่มีดีล"
              description="แปลงรายชื่อที่สนใจเป็นดีล หรือเพิ่มดีลใหม่"
              action={canEdit ? <Button onClick={openCreate}><Plus size={18} /> เพิ่มดีล</Button> : undefined}
            />
          </Card>
        ) : (
          <>
            <div className="xl:hidden">
              <Select label="ดูตามสถานะ" value={mobileStage} onChange={(e) => setMobileStage(e.target.value as SalesStage | "all")}>
                <option value="all">ทุกสถานะ</option>
                {SALES_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{SALES_STAGE_LABELS[stage]}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
              {SALES_STAGES.map((stage) => {
                const column = deals.filter((d) => d.stage === stage);
                const total = column.reduce((sum, d) => sum + (d.value ?? 0), 0);
                return (
                  <Card
                    key={stage}
                    className={`overflow-hidden ${stageSurface[stage]} ${mobileStage !== "all" && mobileStage !== stage ? "hidden xl:block" : ""}`}
                    aria-label={`${SALES_STAGE_LABELS[stage]} ${column.length} ดีล`}
                  >
                    <CardHeader title={SALES_STAGE_LABELS[stage]} description={`${column.length} ดีล${total > 0 ? ` · ${money(total)}` : ""}`} />
                    <div className="min-h-20 divide-y divide-border/70">
                      {column.map((deal) => (
                        <article key={deal.id} className="space-y-3 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" onClick={() => openEdit(deal)} className="min-w-0 flex-1 rounded-lg text-left">
                              <p className="text-sm font-semibold leading-snug">{deal.title}</p>
                              <p className="mt-1 truncate text-xs text-muted">{deal.client?.name ?? deal.company ?? "ยังไม่ผูกลูกค้า"}</p>
                            </button>
                            <SalesStageBadge stage={deal.stage} />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-base font-semibold tabular-nums">{money(deal.value)}</p>
                            {deal.owner && <Avatar name={deal.owner.display_name} src={deal.owner.avatar_url} size="sm" />}
                          </div>
                          {(deal.contact_phone || deal.next_follow_up) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                              {deal.contact_phone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {deal.contact_phone}</span>}
                              {deal.next_follow_up && <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {deal.next_follow_up}</span>}
                            </div>
                          )}
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <select
                                aria-label={`ย้ายสถานะของดีล ${deal.title}`}
                                value={deal.stage}
                                onChange={(e) => void moveDeal(deal, e.target.value as SalesStage)}
                                className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                              >
                                {SALES_STAGES.map((s) => <option key={s} value={s}>{SALES_STAGE_LABELS[s]}</option>)}
                              </select>
                              <button type="button" onClick={() => void deleteDeal(deal)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted" aria-label={`ลบดีล ${deal.title}`}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
            <p className="text-sm text-muted">ปิดได้แล้ว {wonCount} ดีล</p>
          </>
        )
      )}

      <ProspectImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        profiles={profiles}
        currentUserId={profile?.id}
        onImport={importProspects}
      />
      <ProspectDrawer
        prospect={openProspect}
        profiles={profiles}
        onClose={() => setOpenProspect(null)}
        onChanged={() => void load()}
      />
      <Modal open={playbookOpen} onClose={() => setPlaybookOpen(false)} title="คู่มือคุยสนามแบด">
        <div className="space-y-3 text-sm">
          <p>{PLAYBOOK.intro}</p>
          <p className="font-semibold">คำถามคัดกรอง</p>
          <ul className="list-disc space-y-1 pl-5">
            {PLAYBOOK.qualify.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p>{PLAYBOOK.offer}</p>
        </div>
      </Modal>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "แก้ดีล" : "เพิ่มดีล"}>
        <div className="space-y-3">
          <Input label="ชื่องาน / ดีล" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
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
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input label="บริษัท" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <Input label="ผู้ติดต่อ" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="เบอร์โทร" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            <Input label="อีเมล" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="มูลค่าโดยประมาณ" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <Input label="นัดติดตาม" type="date" value={form.next_follow_up} onChange={(e) => setForm({ ...form, next_follow_up: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select label="สถานะ" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as SalesStage })}>
              {SALES_STAGES.map((stage) => <option key={stage} value={stage}>{SALES_STAGE_LABELS[stage]}</option>)}
            </Select>
            <Select label="ผู้รับผิดชอบ" value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
              <option value="">ยังไม่กำหนด</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </Select>
          </div>
          <Textarea label="หมายเหตุ" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2 pt-2">
            <Button onClick={() => void saveDeal()} loading={saving} className="flex-1">บันทึก</Button>
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<PageLoader label="กำลังโหลดงานขาย..." />}>
      <SalesPageInner />
    </Suspense>
  );
}
