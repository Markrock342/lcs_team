"use client";

import { useEffect, useState } from "react";
import { Plus, Phone, Mail, Trash2, Pencil, Users, ExternalLink, Link2, Share2, FileUp, Copy, Check, ChevronDown, CheckSquare, UserRound } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  ClientStatusBadge,
  ErrorState,
  ListRow,
  Modal,
  Input,
  Textarea,
  EmptyState,
  PageLoader,
} from "@/components/ui";
import { PageHeader, FilterTabs, PageShell } from "@/components/mobile-ui";
import {
  AmountField,
  ChoiceChips,
  FormActions,
  FormError,
  FormSection,
} from "@/components/form-ui";
import { SavedViewsBar } from "@/components/workspace/SavedViewsBar";
import { useRole } from "@/components/RoleProvider";
import { useActionFeedback } from "@/components/workspace/ActionFeedback";
import Link from "next/link";
import {
  PROJECT_TYPE_LABELS,
  CLIENT_STATUS_LABELS,
} from "@/lib/constants";
import { CLIENT_LINK_FIELDS } from "@/lib/constants";
import { uploadFile } from "@/lib/upload";
import { logActivity } from "@/lib/activity";
import { neonRequest } from "@/lib/neon/client";
import type { Client, ProjectType, ClientStatus } from "@/lib/types";
import type { ClientFile } from "@/lib/extras-types";
import Image from "next/image";

function ClientCover({ src, name }: { src: string; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const isDocument = /\.(pdf|docx?|xlsx?|pptx?)(?:$|[?#])/i.test(src);

  if (isDocument || failedSrc === src) return null;

  return (
    <div className="relative aspect-16/7 overflow-hidden bg-surface-soft">
      <Image
        src={src}
        alt={`ภาพปก ${name}`}
        fill
        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}

const emptyClient = {
  name: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  company: "",
  project_type: "other" as ProjectType,
  description: "",
  budget: "",
  notes: "",
  status: "lead" as ClientStatus,
  repo_url: "",
  supabase_url: "",
  figma_url: "",
  staging_url: "",
  production_url: "",
  docs_url: "",
  drive_url: "",
};

export default function ClientsPage() {
  const { canEdit } = useRole();
  const { confirm } = useActionFeedback();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [clientFiles, setClientFiles] = useState<ClientFile[]>([]);
  const [fileUploading, setFileUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [copiedPortal, setCopiedPortal] = useState<string | null>(null);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    loadClients();
    if (new URLSearchParams(window.location.search).get("create") === "1") {
      openCreate();
    }
  }, []);

  async function loadClients() {
    setLoading(true);
    setLoadError("");
    try {
      const { clients: data } = await neonRequest<{ clients: Client[] }>(
        "/api/neon/clients",
        { cache: "no-store" }
      );
      setClients(data ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "โหลดข้อมูลลูกค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyClient);
    setImageFile(null);
    setUploadError("");
    setShowAdvanced(false);
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setShowAdvanced(false);
    setPortalEnabled(!!(client as Client & { portal_enabled?: boolean }).portal_enabled);
    loadClientFiles(client.id);
    setForm({
      name: client.name,
      contact_name: client.contact_name ?? "",
      contact_phone: client.contact_phone ?? "",
      contact_email: client.contact_email ?? "",
      company: client.company ?? "",
      project_type: client.project_type,
      description: client.description ?? "",
      budget: client.budget?.toString() ?? "",
      notes: client.notes ?? "",
      status: client.status,
      repo_url: client.repo_url ?? "",
      supabase_url: client.supabase_url ?? "",
      figma_url: client.figma_url ?? "",
      staging_url: client.staging_url ?? "",
      production_url: client.production_url ?? "",
      docs_url: client.docs_url ?? "",
      drive_url: client.drive_url ?? "",
    });
    setImageFile(null);
    setUploadError("");
    setModalOpen(true);
  }

  async function loadClientFiles(clientId: string) {
    try {
      const { files } = await neonRequest<{ files: ClientFile[] }>(
        `/api/neon/client-files?clientId=${encodeURIComponent(clientId)}`,
        { cache: "no-store" }
      );
      setClientFiles(files ?? []);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "โหลดไฟล์ไม่สำเร็จ");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editing || !e.target.files?.[0]) return;
    setFileUploading(true);
    setUploadError("");
    const file = e.target.files[0];
    const uploaded = await uploadFile(file, "client-files");
    if (!uploaded.ok) {
      setUploadError(uploaded.error);
      setFileUploading(false);
      e.target.value = "";
      return;
    }
    try {
      await neonRequest("/api/neon/client-files", {
        method: "POST",
        body: JSON.stringify({
          client_id: editing.id,
          name: file.name,
          file_url: uploaded.url,
          file_type: file.type,
          file_size: file.size,
        }),
      });
      await logActivity("upload", "client_file", editing.id, file.name);
      await loadClientFiles(editing.id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "บันทึกไฟล์ไม่สำเร็จ");
    }
    setFileUploading(false);
    e.target.value = "";
  }

  async function deleteClientFile(id: string) {
    if (!editing) return;
    const ok = await confirm({
      title: "ลบไฟล์",
      message: "ลบไฟล์นี้หรือไม่?",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    try {
      await neonRequest("/api/neon/client-files", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await loadClientFiles(editing.id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "ลบไฟล์ไม่สำเร็จ");
    }
  }

  async function togglePortal(enabled: boolean) {
    if (!editing) return;
    setPortalEnabled(enabled);
    try {
      const { client } = await neonRequest<{ client: Client & { portal_enabled?: boolean; portal_token?: string } }>(
        "/api/neon/clients",
        {
          method: "PATCH",
          body: JSON.stringify({ id: editing.id, portal_enabled: enabled }),
        }
      );
      setEditing(client as Client);
      await loadClients();
    } catch (error) {
      setPortalEnabled(!enabled);
      setUploadError(error instanceof Error ? error.message : "อัปเดตพอร์ทัลไม่สำเร็จ");
    }
  }

  function copyPortalLink(client: Client & { portal_token?: string }) {
    if (!client.portal_token) return;
    const url = `${window.location.origin}/portal/${client.portal_token}`;
    navigator.clipboard.writeText(url);
    setCopiedPortal(client.id);
    setTimeout(() => setCopiedPortal(null), 2000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setUploadError("");

    let image_url = editing?.image_url ?? null;

    if (imageFile) {
      if (!imageFile.type.startsWith("image/")) {
        setSaving(false);
        setUploadError("ภาพปกต้องเป็นไฟล์รูปภาพเท่านั้น");
        return;
      }
      const uploaded = await uploadFile(imageFile, "clients");
      if (!uploaded.ok) {
        setSaving(false);
        setUploadError(uploaded.error);
        return;
      }
      image_url = uploaded.url;
    }

    const payload = {
      name: form.name,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      company: form.company || null,
      project_type: form.project_type,
      description: form.description || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      notes: form.notes || null,
      status: form.status,
      image_url,
      repo_url: form.repo_url || null,
      supabase_url: form.supabase_url || null,
      figma_url: form.figma_url || null,
      staging_url: form.staging_url || null,
      production_url: form.production_url || null,
      docs_url: form.docs_url || null,
      drive_url: form.drive_url || null,
    };

    try {
      if (editing) {
        await neonRequest<{ client: Client }>("/api/neon/clients", {
          method: "PATCH",
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
        await logActivity("update", "client", editing.id, form.name);
      } else {
        await neonRequest<{ client: Client }>("/api/neon/clients", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await logActivity("create", "client", null, form.name);
      }
      setModalOpen(false);
      await loadClients();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "บันทึกลูกค้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "ลบลูกค้า",
      message: "ลบลูกค้านี้หรือไม่?",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    try {
      await neonRequest<{ ok: true }>("/api/neon/clients", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await loadClients();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "ลบลูกค้าไม่สำเร็จ");
    }
  }

  const filtered =
    (filter === "all" ? clients : clients.filter((c) => c.status === filter)).filter(
      (c) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company?.toLowerCase().includes(q) ?? false) ||
          (c.contact_name?.toLowerCase().includes(q) ?? false)
        );
      }
    );

  if (loading) {
    return <PageLoader label="กำลังโหลดลูกค้า..." />;
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="ลูกค้า"
        description={
          canEdit
            ? "ติดตามสถานะ ผู้ติดต่อ งาน และพอร์ทัลของลูกค้า"
            : "โหมดดูอย่างเดียว (Guest)"
        }
        action={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus size={18} /> เพิ่มลูกค้า
            </Button>
          ) : undefined
        }
      />

      <SavedViewsBar
        page="clients"
        filters={{ status: filter }}
        onApply={(filters) => {
          if (filters.status) setFilter(filters.status);
        }}
      />

      <input
        aria-label="ค้นหาลูกค้า"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        type="search"
        placeholder="ค้นหาชื่อลูกค้า, บริษัท, ผู้ติดต่อ..."
        className="w-full min-h-12 px-4 rounded-xl bg-card border border-border text-base placeholder:text-muted"
      />

      <FilterTabs
        active={filter}
        onChange={setFilter}
        tabs={[
          { key: "all", label: "ทั้งหมด", count: clients.length },
          ...Object.entries(CLIENT_STATUS_LABELS).map(([k, v]) => ({
            key: k,
            label: v,
            count: clients.filter((c) => c.status === k).length,
          })),
        ]}
      />

      {loadError ? (
        <ErrorState
          description={loadError}
          onRetry={loadClients}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={clients.length === 0 ? "ยังไม่มีลูกค้า" : "ไม่พบลูกค้าที่ค้นหา"}
          description={
            clients.length === 0
              ? "เพิ่มลูกค้าใหม่เพื่อเริ่มติดตามงาน"
              : "ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ"
          }
        />
      ) : (
        <div className="auto-card-grid">
          {filtered.map((client) => (
            <Card
              key={client.id}
              interactive
              className="flex min-h-full flex-col"
            >
              {client.image_url && <ClientCover src={client.image_url} name={client.name} />}
              <CardHeader
                title={client.name}
                description={[client.company, PROJECT_TYPE_LABELS[client.project_type]]
                  .filter(Boolean)
                  .join(" · ")}
                action={<ClientStatusBadge status={client.status} />}
              />

              <div className="flex flex-1 flex-col">
                {client.description && (
                  <p className="px-4 pt-3 text-[0.9375rem] leading-relaxed text-muted line-clamp-3">
                    {client.description}
                  </p>
                )}

                <div className="divide-y divide-border">
                  {client.contact_name && (
                    <ListRow
                      leading={<UserRound size={16} className="text-muted" />}
                      title={client.contact_name}
                      description="ผู้ติดต่อ"
                      className="min-h-0 py-2.5"
                    />
                  )}
                  {client.contact_phone && (
                    <ListRow
                      leading={<Phone size={16} className="text-muted" />}
                      title={
                        <a href={`tel:${client.contact_phone}`} className="hover:text-accent">
                          {client.contact_phone}
                        </a>
                      }
                      description="โทรศัพท์"
                      className="min-h-0 py-2.5"
                    />
                  )}
                  {client.contact_email && (
                    <ListRow
                      leading={<Mail size={16} className="text-muted" />}
                      title={
                        <a href={`mailto:${client.contact_email}`} className="break-all hover:text-accent">
                          {client.contact_email}
                        </a>
                      }
                      description="อีเมล"
                      className="min-h-0 py-2.5"
                    />
                  )}
                </div>

                {CLIENT_LINK_FIELDS.some(
                  (f) => client[f.key as keyof Client]
                ) && (
                  <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border">
                    {CLIENT_LINK_FIELDS.filter(
                      (f) => client[f.key as keyof Client]
                    ).map((f) => (
                      <a
                        key={f.key}
                        href={client[f.key as keyof Client] as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface-soft px-3 text-sm font-medium text-accent hover:bg-card-hover"
                      >
                        <Link2 size={14} />
                        {f.label}
                        <ExternalLink size={13} />
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border p-3">
                  <Link
                    href={`/clients/${client.id}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-soft px-3 text-sm font-semibold hover:bg-card-hover"
                  >
                    <Users size={16} /> รายละเอียด
                  </Link>
                  <Link
                    href={`/tasks?client=${client.id}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent/10 px-3 text-sm font-semibold text-accent hover:bg-accent/20"
                  >
                    <CheckSquare size={16} /> งาน
                  </Link>
                  {canEdit &&
                    (client as Client & { portal_enabled?: boolean; portal_token?: string }).portal_enabled &&
                    (client as Client & { portal_token?: string }).portal_token && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => copyPortalLink(client as Client & { portal_token: string })}
                      className="px-3"
                      title="คัดลอกลิงก์พอร์ทัลลูกค้า"
                    >
                      {copiedPortal === client.id ? <Check size={16} /> : <Share2 size={16} />}
                      {copiedPortal === client.id ? "คัดลอกแล้ว" : "พอร์ทัล"}
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => openEdit(client)}
                        className="px-3"
                      >
                        <Pencil size={16} /> แก้ไข
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้าใหม่"}
      >
        <form onSubmit={handleSave} className="space-y-7">
          <FormError message={uploadError} />
          {!editing && (
            <p className="text-[0.9375rem] leading-snug text-muted">
              กรอกแค่ชื่อก็บันทึกได้ ส่วนที่เหลือกลับมาเติมทีหลังได้
            </p>
          )}

          <FormSection step={1} title="ลูกค้าและงาน" hint="ชื่อที่ทีมใช้เรียก และประเภทงานที่รับ">
            <Input
              label="ชื่อลูกค้า / โปรเจกต์ *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น แอพสั่งอาหาร ABC"
              enterKeyHint="next"
              required
            />
            <Input
              label="บริษัท / หน่วยงาน"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="เช่น บริษัท เอบีซี จำกัด"
              autoComplete="organization"
              enterKeyHint="next"
            />
            <ChoiceChips
              label="ประเภทงาน"
              value={form.project_type}
              onChange={(project_type) => setForm({ ...form, project_type })}
              options={Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({
                value: value as ProjectType,
                label,
              }))}
            />
            <ChoiceChips
              label="สถานะ"
              value={form.status}
              onChange={(status) => setForm({ ...form, status })}
              options={Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => ({
                value: value as ClientStatus,
                label,
              }))}
            />
          </FormSection>

          <FormSection step={2} title="ผู้ติดต่อ" hint="คนที่ทีมต้องโทรหรือส่งอีเมลหา">
            <Input
              label="ชื่อผู้ติดต่อ"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              placeholder="เช่น คุณสมชาย"
              autoComplete="name"
              enterKeyHint="next"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="เบอร์โทร"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="08x-xxx-xxxx"
                enterKeyHint="next"
              />
              <Input
                label="อีเมล"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="name@example.com"
                enterKeyHint="next"
              />
            </div>
          </FormSection>

          <FormSection step={3} title="รายละเอียดงาน" hint="ขอบเขตงานและงบที่คุยกันไว้">
            <Textarea
              label="ลูกค้าต้องการอะไร"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="เช่น ทำแอพ iOS/Android, ระบบ admin, API..."
            />
            <AmountField
              label="งบประมาณ"
              required={false}
              value={form.budget}
              onChange={(budget) => setForm({ ...form, budget })}
              hint={form.budget ? undefined : "เว้นว่างได้ถ้ายังไม่สรุป"}
            />
            <Textarea
              label="หมายเหตุภายในทีม"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="เช่น ลูกค้าสะดวกคุยช่วงบ่าย"
            />
          </FormSection>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left touch-manipulation"
          >
            <Link2 size={20} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium leading-snug">ลิงก์โปรเจกต์ · ภาพปก{editing ? " · พอร์ทัล · ไฟล์" : ""}</span>
              <span className="block text-sm leading-snug text-muted">ไม่บังคับ</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>

          {showAdvanced && (
            <>
              <div className="space-y-3 pt-1">
                {CLIENT_LINK_FIELDS.map((f) => (
                  <Input
                    key={f.key}
                    label={f.label}
                    type="url"
                    value={form[f.key as keyof typeof form] as string}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                    placeholder={f.placeholder}
                  />
                ))}
              </div>

              <div>
                <p className="mb-1.5 block text-sm font-medium text-foreground">
                  ภาพปกลูกค้า
                </p>
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/40 touch-manipulation">
                  <FileUp size={20} className="text-muted shrink-0" />
                  <span className="text-sm text-muted truncate">
                    {imageFile
                      ? imageFile.name
                      : editing?.image_url
                        ? "มีภาพปกแล้ว — แตะเลือกใหม่"
                        : "แตะเลือกภาพปก"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file && !file.type.startsWith("image/")) {
                        setImageFile(null);
                        setUploadError("ภาพปกต้องเป็นไฟล์รูปภาพเท่านั้น");
                        e.target.value = "";
                        return;
                      }
                      setImageFile(file);
                      setUploadError("");
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {editing && (
                <>
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Share2 size={16} className="text-accent" /> พอร์ทัลลูกค้า
                      </p>
                      <label className="flex min-h-11 items-center gap-2.5 text-[0.9375rem] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={portalEnabled}
                          onChange={(e) => togglePortal(e.target.checked)}
                          className="size-5 rounded border-border"
                        />
                        เปิดใช้งาน
                      </label>
                    </div>
                    {portalEnabled && (editing as Client & { portal_token?: string }).portal_token && (
                      <div className="flex gap-2 [&>div:first-child]:min-w-0 [&>div:first-child]:flex-1">
                        <Input
                          aria-label="ลิงก์พอร์ทัลลูกค้า"
                          readOnly
                          value={`${typeof window !== "undefined" ? window.location.origin : ""}/portal/${(editing as Client & { portal_token: string }).portal_token}`}
                        />
                        <button
                          type="button"
                          onClick={() => copyPortalLink(editing as Client & { portal_token: string })}
                          aria-label="คัดลอกลิงก์พอร์ทัล"
                          className="mt-auto flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent hover:bg-accent/20 shrink-0"
                        >
                          {copiedPortal === editing.id ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border">
                    <p className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                      <FileUp size={16} className="text-accent" /> ไฟล์ลูกค้า / ใบสัญญา
                    </p>
                    <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/40 touch-manipulation mb-3">
                      <FileUp size={18} className="text-muted" />
                      <span className="text-sm text-muted">
                        {fileUploading ? "กำลังอัปโหลด..." : "แตะเลือกไฟล์"}
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf,image/heic,image/heif"
                        onChange={handleFileUpload}
                        disabled={fileUploading}
                        className="hidden"
                      />
                    </label>
                    {clientFiles.length > 0 && (
                      <ul className="space-y-2">
                        {clientFiles.map((f) => (
                          <li key={f.id} className="flex items-center gap-2 text-[0.9375rem] bg-background rounded-xl pl-3 pr-1">
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 py-2.5 wrap-anywhere text-accent hover:underline">
                              {f.name}
                            </a>
                            <button type="button" onClick={() => deleteClientFile(f.id)} aria-label={`ลบไฟล์ ${f.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-(--status-red-fg) hover:bg-(--status-red-bg)">
                              <Trash2 size={18} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {editing && canEdit && (
            <button
              type="button"
              onClick={() => {
                const id = editing.id;
                setModalOpen(false);
                void handleDelete(id);
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-(--status-red-fg) hover:bg-(--status-red-bg)"
            >
              <Trash2 size={16} /> ลบลูกค้ารายนี้
            </button>
          )}

          <FormActions summary={form.name.trim() ? undefined : "ใส่ชื่อลูกค้าก่อนบันทึก"}>
            <Button type="submit" loading={saving}>
              {editing ? "บันทึกการแก้ไข" : "เพิ่มลูกค้า"}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </PageShell>
  );
}
