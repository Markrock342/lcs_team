"use client";

import { useEffect, useState } from "react";
import { Plus, Play, Trash2, Pencil } from "lucide-react";
import { neonRequest } from "@/lib/neon/client";
import { FilterTabs, PageHeader, PageShell } from "@/components/mobile-ui";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  ListRow,
  Modal,
  PageLoader,
  Select,
  StatusStamp,
  Textarea,
} from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { logActivity, notifyTeam } from "@/lib/activity";
import { isAdmin } from "@/lib/permissions";
import { useActionFeedback } from "@/components/workspace/ActionFeedback";
import type { TaskTemplate, TaskTemplateItem } from "@/lib/extras-types";
import type { Client, Profile, TeamRole } from "@/lib/types";
import { useRouter } from "next/navigation";
import { DocumentKitList } from "@/components/workspace/DocumentKitList";

const emptyItem = {
  title: "",
  description: "",
  suggested_role: "" as TeamRole | "",
  duration_days: "3",
};

export default function TemplatesPage() {
  const { confirm } = useActionFeedback();
  const router = useRouter();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currentRole, setCurrentRole] = useState<TeamRole>("pm");
  const [loading, setLoading] = useState(true);
  const [useModal, setUseModal] = useState<TaskTemplate | null>(null);
  const [editModal, setEditModal] = useState<TaskTemplate | null>(null);
  const [clientId, setClientId] = useState("");
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formItems, setFormItems] = useState([{ ...emptyItem }]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"tasks" | "quotation" | "agreement">("tasks");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setError(null);
    const [templateData, clientData, profileData] = await Promise.all([
      neonRequest<{ templates: TaskTemplate[] }>("/api/neon/templates", { cache: "no-store" }),
      neonRequest<{ clients: Client[] }>("/api/neon/clients", { cache: "no-store" }),
      neonRequest<{ profile: Profile }>("/api/neon/profiles?me=1", { cache: "no-store" }),
    ]);
    setTemplates(
      templateData.templates.map((t) => ({
        ...t,
        items: (t.items ?? []).sort(
          (a: TaskTemplateItem, b: TaskTemplateItem) => a.sort_order - b.sort_order
        ),
      }))
    );
    setClients(clientData.clients ?? []);
    setCurrentRole(profileData.profile.role);
    setCurrentUserId(profileData.profile.id);
    setLoading(false);
  }

  function openCreate() {
    setEditModal({ id: "", name: "", description: "", project_type: null, created_by: null, created_at: "", items: [] });
    setFormName("");
    setFormDesc("");
    setFormItems([{ ...emptyItem }]);
  }

  function openEditTemplate(tpl: TaskTemplate) {
    setEditModal(tpl);
    setFormName(tpl.name);
    setFormDesc(tpl.description ?? "");
    setFormItems(
      tpl.items?.length
        ? tpl.items.map((i) => ({
            title: i.title,
            description: i.description ?? "",
            suggested_role: (i.suggested_role ?? "") as TeamRole | "",
            duration_days: String(i.duration_days),
          }))
        : [{ ...emptyItem }]
    );
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const items = formItems
      .filter((item) => item.title.trim())
      .map((item, index) => ({
        title: item.title.trim(),
        description: item.description.trim() || null,
        suggested_role: item.suggested_role || null,
        duration_days: parseInt(item.duration_days) || 3,
        sort_order: index + 1,
      }));
    let templateId = editModal?.id ?? "";
    if (editModal?.id) {
      await neonRequest("/api/neon/templates", {
        method: "PATCH",
        body: JSON.stringify({ id: editModal.id, name: formName.trim(), description: formDesc.trim() || null, items }),
      });
    } else {
      const { template } = await neonRequest<{ template: TaskTemplate }>("/api/neon/templates", {
        method: "POST",
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || null, items }),
      });
      templateId = template.id;
    }
    await logActivity("create", "task_template", templateId, formName);

    setSaving(false);
    setEditModal(null);
    void load();
  }

  async function deleteTemplate(id: string) {
    const ok = await confirm({
      title: "ลบเทมเพลต",
      message: "ลบเทมเพลตนี้หรือไม่?",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    await neonRequest("/api/neon/templates", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    void load();
  }

  async function applyTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!useModal || !clientId) return;
    setApplying(true);
    const { task: parent } = await neonRequest<{ task: { id: string } }>("/api/neon/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: useModal.name,
        description: useModal.description,
        client_id: clientId,
        status: "pending",
        duration_days: useModal.items?.reduce((s, i) => s + i.duration_days, 0) ?? 7,
      }),
    });

    if (parent && useModal.items) {
      for (const item of useModal.items) {
        await neonRequest("/api/neon/tasks", {
          method: "POST",
          body: JSON.stringify({
            parent_id: parent.id,
            client_id: clientId,
            title: item.title,
            description: item.description,
            status: "pending",
            duration_days: item.duration_days,
          }),
        });
      }
    }

    await logActivity("create", "task", parent?.id ?? null, useModal.name, {
      from_template: useModal.id,
    });
    await notifyTeam(
      currentUserId,
      "โปรเจกต์ใหม่",
      `สร้างจากเทมเพลต: ${useModal.name}`,
      "/tasks"
    );
    setApplying(false);
    setUseModal(null);
    router.push("/tasks");
  }

  const canManage = isAdmin(currentRole);

  if (loading)
    return <PageLoader label="กำลังโหลดเทมเพลต..." />;

  if (error) {
    return (
      <PageShell width="medium">
        <ErrorState
          description={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="medium">
      <PageHeader
        title="เทมเพลต"
        description="ชุดงานมาตรฐาน ใบเสนอราคา และสัญญาทีม — กดใช้แล้วกรอกชื่อลูกค้าได้เลย"
        action={
          canManage && tab === "tasks" ? (
            <Button onClick={openCreate}>
              <Plus size={18} /> สร้างเทมเพลต
            </Button>
          ) : undefined
        }
      />

      <FilterTabs
        active={tab}
        onChange={(key) => setTab(key as typeof tab)}
        tabs={[
          { key: "tasks", label: "งาน", count: templates.length },
          { key: "quotation", label: "ใบเสนอราคา", count: 1 },
          { key: "agreement", label: "สัญญา", count: 1 },
        ]}
      />

      {tab === "quotation" && <DocumentKitList kind="quotation" clients={clients} />}
      {tab === "agreement" && <DocumentKitList kind="agreement" clients={clients} />}

      {tab === "tasks" && (templates.length > 0 ? (
        <div className="space-y-6">
        {templates.map((tpl) => (
          <Card key={tpl.id}>
            <CardHeader
              title={tpl.name}
              description={tpl.description ?? `${tpl.items?.length ?? 0} งานย่อย`}
            />
            {tpl.items && tpl.items.length > 0 ? (
              <div className="divide-y divide-border">
                {tpl.items.map((item, i) => (
                  <ListRow
                    key={item.id}
                    leading={
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-soft text-xs font-semibold tabular-nums">
                        {i + 1}
                      </span>
                    }
                    title={item.title}
                    description={item.description ?? undefined}
                    trailing={
                      <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                        {item.suggested_role && (
                          <StatusStamp
                            label={`บทบาท ${ROLE_LABELS[item.suggested_role as TeamRole]}`}
                            tone="violet"
                          />
                        )}
                        <StatusStamp label={`${item.duration_days} วัน`} />
                      </div>
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted">ยังไม่มีงานย่อยในชุดนี้</p>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                {canManage && (
                  <>
                    <Button variant="ghost" onClick={() => openEditTemplate(tpl)}>
                      <Pencil size={16} /> แก้ไข
                    </Button>
                    <Button variant="ghost" onClick={() => deleteTemplate(tpl.id)}>
                      <Trash2 size={16} className="text-red-400" /> ลบ
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => {
                    setUseModal(tpl);
                    setClientId("");
                  }}
                >
                  <Play size={16} /> ใช้เทมเพลต
                </Button>
            </div>
          </Card>
        ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Plus size={28} />}
            title="ยังไม่มีเทมเพลตงาน"
            description={
              canManage
                ? "สร้างชุดงานแรกเพื่อใช้เริ่มโปรเจกต์ได้เร็วขึ้น"
                : "ผู้ดูแลระบบยังไม่ได้สร้างเทมเพลตงาน"
            }
            action={
              canManage ? (
                <Button onClick={openCreate}>
                  <Plus size={18} /> สร้างเทมเพลต
                </Button>
              ) : undefined
            }
          />
        </Card>
      ))}

      <Modal
        open={!!useModal}
        onClose={() => setUseModal(null)}
        title={`ใช้เทมเพลต: ${useModal?.name}`}
      >
        <form onSubmit={applyTemplate} className="space-y-4">
          <Select label="ลูกค้า *" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">เลือกลูกค้า</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted">
            จะสร้างงานใหญ่ 1 + งานย่อย {useModal?.items?.length ?? 0} รายการ
          </p>
          <Button type="submit" loading={applying} className="w-full">
            สร้างโปรเจกต์
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!editModal}
        onClose={() => setEditModal(null)}
        title={editModal?.id ? "แก้ไขเทมเพลต" : "สร้างเทมเพลต"}
      >
        <form onSubmit={saveTemplate} className="space-y-4">
          <Input label="ชื่อเทมเพลต *" value={formName} onChange={(e) => setFormName(e.target.value)} required />
          <Textarea label="คำอธิบาย" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} />
          <div className="space-y-2">
            <p className="text-sm font-medium">รายการงานย่อย</p>
            {formItems.map((item, idx) => (
              <div key={idx} className="space-y-2 bg-surface-soft p-3">
                <Input
                  label="ชื่องาน"
                  value={item.title}
                  onChange={(e) => {
                    const next = [...formItems];
                    next[idx] = { ...next[idx], title: e.target.value };
                    setFormItems(next);
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label="บทบาท"
                    value={item.suggested_role}
                    onChange={(e) => {
                      const next = [...formItems];
                      next[idx] = {
                        ...next[idx],
                        suggested_role: e.target.value as TeamRole | "",
                      };
                      setFormItems(next);
                    }}
                  >
                    <option value="">—</option>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="วัน"
                    type="number"
                    min="1"
                    value={item.duration_days}
                    onChange={(e) => {
                      const next = [...formItems];
                      next[idx] = { ...next[idx], duration_days: e.target.value };
                      setFormItems(next);
                    }}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFormItems([...formItems, { ...emptyItem }])}
            >
              <Plus size={14} /> เพิ่มรายการ
            </Button>
          </div>
          <Button type="submit" loading={saving} className="w-full">
            บันทึกเทมเพลต
          </Button>
        </form>
      </Modal>
    </PageShell>
  );
}
