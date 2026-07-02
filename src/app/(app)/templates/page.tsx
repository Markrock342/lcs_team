"use client";

import { useEffect, useState } from "react";
import { Plus, Play, Trash2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/mobile-ui";
import { Button, Modal, Input, Textarea, Select } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { logActivity, notifyTeam } from "@/lib/activity";
import { isAdmin } from "@/lib/permissions";
import type { TaskTemplate, TaskTemplateItem } from "@/lib/extras-types";
import type { Client, TeamRole } from "@/lib/types";
import { useRouter } from "next/navigation";

const emptyItem = {
  title: "",
  description: "",
  suggested_role: "" as TeamRole | "",
  duration_days: "3",
};

export default function TemplatesPage() {
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

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [tpl, cls, profile] = await Promise.all([
      supabase.from("task_templates").select("*, items:task_template_items(*)").order("name"),
      supabase.from("clients").select("*").order("name"),
      user
        ? supabase.from("profiles").select("role").eq("id", user.id).single()
        : Promise.resolve({ data: null }),
    ]);
    setTemplates(
      (tpl.data ?? []).map((t) => ({
        ...t,
        items: (t.items ?? []).sort(
          (a: TaskTemplateItem, b: TaskTemplateItem) => a.sort_order - b.sort_order
        ),
      }))
    );
    setClients(cls.data ?? []);
    if (profile.data?.role) setCurrentRole(profile.data.role as TeamRole);
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
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let templateId = editModal?.id;
    if (editModal?.id) {
      await supabase
        .from("task_templates")
        .update({ name: formName.trim(), description: formDesc.trim() || null })
        .eq("id", editModal.id);
      await supabase.from("task_template_items").delete().eq("template_id", editModal.id);
    } else {
      const { data } = await supabase
        .from("task_templates")
        .insert({
          name: formName.trim(),
          description: formDesc.trim() || null,
          created_by: user?.id,
        })
        .select("id")
        .single();
      templateId = data?.id;
    }

    if (templateId) {
      const items = formItems
        .filter((i) => i.title.trim())
        .map((item, idx) => ({
          template_id: templateId,
          title: item.title.trim(),
          description: item.description.trim() || null,
          suggested_role: item.suggested_role || null,
          duration_days: parseInt(item.duration_days) || 3,
          sort_order: idx + 1,
        }));
      if (items.length) {
        await supabase.from("task_template_items").insert(items);
      }
      await logActivity("create", "task_template", templateId, formName);
    }

    setSaving(false);
    setEditModal(null);
    load();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("ลบเทมเพลตนี้?")) return;
    const supabase = createClient();
    await supabase.from("task_templates").delete().eq("id", id);
    load();
  }

  async function applyTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!useModal || !clientId) return;
    setApplying(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: parent } = await supabase
      .from("tasks")
      .insert({
        title: useModal.name,
        description: useModal.description,
        client_id: clientId,
        status: "pending",
        created_by: user?.id,
        duration_days: useModal.items?.reduce((s, i) => s + i.duration_days, 0) ?? 7,
      })
      .select()
      .single();

    if (parent && useModal.items) {
      for (const item of useModal.items) {
        await supabase.from("tasks").insert({
          parent_id: parent.id,
          client_id: clientId,
          title: item.title,
          description: item.description,
          status: "pending",
          duration_days: item.duration_days,
          created_by: user?.id,
        });
      }
    }

    await logActivity("create", "task", parent?.id ?? null, useModal.name, {
      from_template: useModal.id,
    });
    await notifyTeam(
      user?.id ?? null,
      "📋 โปรเจกต์ใหม่",
      `สร้างจากเทมเพลต: ${useModal.name}`,
      "/tasks"
    );
    setApplying(false);
    setUseModal(null);
    router.push("/tasks");
  }

  const canManage = isAdmin(currentRole);

  if (loading)
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="เทมเพลตงาน"
        description="สร้างและแก้ไขเทมเพลต · ใช้สร้างโปรเจกต์พร้อมงานย่อย"
        action={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus size={18} /> สร้างเทมเพลต
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {templates.map((tpl) => (
          <div key={tpl.id} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold">{tpl.name}</h3>
                {tpl.description && (
                  <p className="text-sm text-muted mt-1">{tpl.description}</p>
                )}
                <div className="mt-3 space-y-1">
                  {tpl.items?.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs text-muted">
                      <span className="w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px]">
                        {i + 1}
                      </span>
                      {item.title}
                      {item.suggested_role && (
                        <span className="text-accent">
                          {ROLE_LABELS[item.suggested_role as TeamRole]}
                        </span>
                      )}
                      <span>· {item.duration_days}d</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {canManage && (
                  <>
                    <Button variant="ghost" onClick={() => openEditTemplate(tpl)}>
                      <Pencil size={16} />
                    </Button>
                    <Button variant="ghost" onClick={() => deleteTemplate(tpl.id)}>
                      <Trash2 size={16} className="text-red-400" />
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
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-center text-muted py-12">
            ยังไม่มีเทมเพลต — กดสร้างเทมเพลตหรือรัน add-all-features.sql
          </p>
        )}
      </div>

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
              <div key={idx} className="p-3 rounded-xl border border-border space-y-2">
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
    </div>
  );
}
