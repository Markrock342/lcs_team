"use client";

import { useEffect, useState } from "react";
import { Plus, Phone, Mail, Trash2, Pencil, Users, ExternalLink, Link2, Share2, FileUp, Copy, Check, ChevronDown, CheckSquare, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Button,
  Card,
  CardHeader,
  ClientStatusBadge,
  ErrorState,
  ListRow,
  Modal,
  Input,
  Select,
  Textarea,
  EmptyState,
  PageLoader,
} from "@/components/ui";
import { PageHeader, FilterTabs, PageShell } from "@/components/mobile-ui";
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
    const supabase = createClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    setClients(data ?? []);
    setLoading(false);
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
    const supabase = createClient();
    const { data } = await supabase
      .from("client_files")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setClientFiles(data ?? []);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editing || !e.target.files?.[0]) return;
    setFileUploading(true);
    setUploadError("");
    const file = e.target.files[0];
    const supabase = createClient();
    const uploaded = await uploadFile(file, "client-files");
    if (!uploaded.ok) {
      setUploadError(uploaded.error);
      setFileUploading(false);
      e.target.value = "";
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("client_files").insert({
      client_id: editing.id,
      name: file.name,
      file_url: uploaded.url,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: user?.id,
    });
    if (error) {
      setUploadError(error.message);
    } else {
      await logActivity("upload", "client_file", editing.id, file.name);
      loadClientFiles(editing.id);
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
    const supabase = createClient();
    await supabase.from("client_files").delete().eq("id", id);
    loadClientFiles(editing.id);
  }

  async function togglePortal(enabled: boolean) {
    if (!editing) return;
    setPortalEnabled(enabled);
    const supabase = createClient();
    const updates: { portal_enabled: boolean; portal_token?: string } = { portal_enabled: enabled };
    if (enabled && !(editing as Client & { portal_token?: string }).portal_token) {
      updates.portal_token = crypto.randomUUID();
    }
    await supabase.from("clients").update(updates).eq("id", editing.id);
    setEditing({ ...editing, ...updates } as Client);
    loadClients();
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

    const supabase = createClient();
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

    if (editing) {
      await supabase.from("clients").update(payload).eq("id", editing.id);
      await logActivity("update", "client", editing.id, form.name);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("clients").insert({ ...payload, created_by: user?.id });
      await logActivity("create", "client", null, form.name);
    }

    setSaving(false);
    setModalOpen(false);
    loadClients();
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "ลบลูกค้า",
      message: "ลบลูกค้านี้หรือไม่?",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    const supabase = createClient();
    await supabase.from("clients").delete().eq("id", id);
    loadClients();
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
        placeholder="ค้นหาชื่อลูกค้า, บริษัท, ผู้ติดต่อ..."
        className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm"
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
                  <p className="px-4 pt-3 text-sm leading-relaxed text-muted line-clamp-3">
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
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-soft px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-card-hover"
                      >
                        <Link2 size={12} />
                        {f.label}
                        <ExternalLink size={11} />
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
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => handleDelete(client.id)}
                        className="col-span-2 px-3"
                      >
                        <Trash2 size={16} /> ลบลูกค้า
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
        <form onSubmit={handleSave} className="space-y-4">
          {uploadError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {uploadError}
            </div>
          )}
          <Input
            label="ชื่อลูกค้า / โปรเจกต์ *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="เช่น แอพสั่งอาหาร ABC"
            required
          />
          <Input
            label="ชื่อผู้ติดต่อ"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            placeholder="คุณสมชาย"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="เบอร์โทร"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="08x-xxx-xxxx"
            />
            <Input
              label="อีเมล"
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </div>
          <Input
            label="บริษัท"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
          <Select
            label="ประเภทงาน"
            value={form.project_type}
            onChange={(e) =>
              setForm({ ...form, project_type: e.target.value as ProjectType })
            }
          >
            {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Textarea
            label="รายละเอียดงาน"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="ทำแอพ iOS/Android, ระบบ admin, API..."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="งบประมาณ (บาท)"
              type="number"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
            <Select
              label="สถานะ"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as ClientStatus })
              }
            >
              {Object.entries(CLIENT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="หมายเหตุ"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between py-2 text-sm text-muted hover:text-foreground touch-manipulation"
          >
            <span className="flex items-center gap-2">
              <Link2 size={16} className="text-accent" />
              ลิงก์โปรเจกต์ · รูป · พอร์ทัล
            </span>
            <ChevronDown size={16} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
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
                <p className="block text-sm font-medium text-zinc-300 mb-1.5">
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
                      <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Share2 size={16} className="text-accent" /> พอร์ทัลลูกค้า
                      </p>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={portalEnabled}
                          onChange={(e) => togglePortal(e.target.checked)}
                          className="rounded border-border"
                        />
                        เปิดใช้งาน
                      </label>
                    </div>
                    {portalEnabled && (editing as Client & { portal_token?: string }).portal_token && (
                      <div className="flex gap-2">
                        <Input
                          label=""
                          readOnly
                          value={`${typeof window !== "undefined" ? window.location.origin : ""}/portal/${(editing as Client & { portal_token: string }).portal_token}`}
                        />
                        <button
                          type="button"
                          onClick={() => copyPortalLink(editing as Client & { portal_token: string })}
                          className="mt-auto p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 shrink-0"
                        >
                          {copiedPortal === editing.id ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border">
                    <p className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
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
                          <li key={f.id} className="flex items-center gap-2 text-sm bg-background rounded-lg px-3 py-2">
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-accent hover:underline">
                              {f.name}
                            </a>
                            <button type="button" onClick={() => deleteClientFile(f.id)} className="text-red-400 hover:text-red-300">
                              <Trash2 size={14} />
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

          <Button type="submit" loading={saving} className="w-full">
            {editing ? "บันทึก" : "เพิ่มลูกค้า"}
          </Button>
        </form>
      </Modal>
    </PageShell>
  );
}
