"use client";

import { useEffect, useState } from "react";
import { Plus, Play, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/mobile-ui";
import { Button, Modal, Input, Textarea, Select } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { logActivity, notifyTeam } from "@/lib/activity";
import type { TaskTemplate } from "@/lib/extras-types";
import type { Client, TeamRole } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [useModal, setUseModal] = useState<TaskTemplate | null>(null);
  const [clientId, setClientId] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const [tpl, cls] = await Promise.all([
      supabase.from("task_templates").select("*, items:task_template_items(*)").order("name"),
      supabase.from("clients").select("*").order("name"),
    ]);
    setTemplates((tpl.data ?? []).map((t) => ({
      ...t,
      items: (t.items ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
    })));
    setClients(cls.data ?? []);
    setLoading(false);
  }

  async function applyTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!useModal || !clientId) return;
    setApplying(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: parent } = await supabase.from("tasks").insert({
      title: useModal.name,
      description: useModal.description,
      client_id: clientId,
      status: "pending",
      created_by: user?.id,
      duration_days: useModal.items?.reduce((s, i) => s + i.duration_days, 0) ?? 7,
    }).select().single();

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

    await logActivity("create", "task", parent?.id ?? null, useModal.name, { from_template: useModal.id });
    await notifyTeam(user?.id ?? null, "📋 โปรเจกต์ใหม่", `สร้างจากเทมเพลต: ${useModal.name}`, "/tasks");
    setApplying(false);
    setUseModal(null);
    router.push("/tasks");
  }

  if (loading) return <div className="flex justify-center py-32"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="เทมเพลตงาน" description="สร้างโปรเจกต์พร้อมงานย่อยอัตโนมัติ" />

      <div className="space-y-4">
        {templates.map((tpl) => (
          <div key={tpl.id} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{tpl.name}</h3>
                {tpl.description && <p className="text-sm text-muted mt-1">{tpl.description}</p>}
                <div className="mt-3 space-y-1">
                  {tpl.items?.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs text-muted">
                      <span className="w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px]">{i + 1}</span>
                      {item.title}
                      {item.suggested_role && (
                        <span className="text-accent">{ROLE_LABELS[item.suggested_role as TeamRole]}</span>
                      )}
                      <span>· {item.duration_days}d</span>
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={() => { setUseModal(tpl); setClientId(""); }}>
                <Play size={16} /> ใช้เทมเพลต
              </Button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-center text-muted py-12">รัน supabase/add-all-features.sql เพื่อ seed เทมเพลต</p>
        )}
      </div>

      <Modal open={!!useModal} onClose={() => setUseModal(null)} title={`ใช้เทมเพลต: ${useModal?.name}`}>
        <form onSubmit={applyTemplate} className="space-y-4">
          <Select label="ลูกค้า *" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">เลือกลูกค้า</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <p className="text-xs text-muted">จะสร้างงานใหญ่ 1 + งานย่อย {useModal?.items?.length ?? 0} รายการ</p>
          <Button type="submit" loading={applying} className="w-full">สร้างโปรเจกต์</Button>
        </form>
      </Modal>
    </div>
  );
}
