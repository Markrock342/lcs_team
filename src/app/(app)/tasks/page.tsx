"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ListTree,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Button,
  Modal,
  Input,
  Select,
  Textarea,
  EmptyState,
  StatusBadge,
  Avatar,
} from "@/components/ui";
import { PageHeader, FilterTabs } from "@/components/mobile-ui";
import { KanbanBoard } from "@/components/KanbanBoard";
import { TimeTracker } from "@/components/TimeTracker";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/lib/constants";
import { uploadFile } from "@/lib/upload";
import { logActivity, notifyUser } from "@/lib/activity";
import type { Task, Client, Profile, TaskStatus, TaskPriority } from "@/lib/types";

const emptyTask = {
  title: "",
  description: "",
  client_id: "",
  parent_id: "",
  status: "pending" as TaskStatus,
  priority: "medium" as TaskPriority,
  assigned_to: "",
  start_date: "",
  due_date: "",
  duration_days: "1",
  progress: "0",
};

function TaskRow({
  task,
  isSub,
  profiles,
  onEdit,
  onDelete,
  onAddSub,
  onStatusChange,
}: {
  task: Task;
  isSub?: boolean;
  profiles: Profile[];
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onAddSub: (parent: Task) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 ${
        isSub ? "pl-6 border-l-2 border-accent/30 ml-3" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {!isSub && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
              งานใหญ่
            </span>
          )}
          {isSub && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium">
              งานย่อย
            </span>
          )}
          <h3 className="font-semibold truncate">{task.title}</h3>
          <StatusBadge status={task.status} />
        </div>
        <p className="text-xs text-muted">
          {task.client?.name ?? "ไม่ระบุลูกค้า"} ·{" "}
          <span className="text-accent">{task.duration_days} วัน</span>
          {task.start_date && task.due_date && (
            <> · {task.start_date} → {task.due_date}</>
          )}
        </p>
                  {task.description && (
                    <p className="text-xs text-muted mt-1 line-clamp-1">{task.description}</p>
                  )}
                  {!isSub && (
                    <div className="mt-2">
                      <TimeTracker taskId={task.id} taskTitle={task.title} />
                    </div>
                  )}
                </div>

      <div className="flex items-center gap-2 flex-wrap">
        {task.assignee ? (
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1">
            <Avatar name={task.assignee.display_name} size="sm" />
            <span className="text-xs">{task.assignee.display_name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted px-2">ยังไม่มอบหมาย</span>
        )}

        <div className="w-16 hidden md:block">
          <div className="h-1.5 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted text-center">{task.progress}%</p>
        </div>

        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
          className="text-xs px-2 py-1.5 bg-background border border-border rounded-lg"
        >
          {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {!isSub && (
          <button
            onClick={() => onAddSub(task)}
            className="p-2 rounded-lg hover:bg-accent/10 text-accent"
            title="เพิ่มงานย่อย"
          >
            <Plus size={14} />
          </button>
        )}
        <button onClick={() => onEdit(task)} className="p-2 rounded-lg hover:bg-card-hover text-muted">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-400">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<"parent" | "sub">("parent");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createClient();
    const [tasksRes, clientsRes, profilesRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*, client:clients(*), assignee:profiles!tasks_assigned_to_fkey(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
      supabase.from("profiles").select("*"),
    ]);
    setTasks(tasksRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }

  const parentTasks = tasks.filter((t) => !t.parent_id);
  const subtasksByParent = tasks.reduce(
    (acc, t) => {
      if (t.parent_id) {
        if (!acc[t.parent_id]) acc[t.parent_id] = [];
        acc[t.parent_id].push(t);
      }
      return acc;
    },
    {} as Record<string, Task[]>
  );

  function openCreateParent() {
    setEditing(null);
    setModalMode("parent");
    setForm({ ...emptyTask });
    setImageFile(null);
    setModalOpen(true);
  }

  function openCreateSub(parent: Task) {
    setEditing(null);
    setModalMode("sub");
    setForm({
      ...emptyTask,
      parent_id: parent.id,
      client_id: parent.client_id ?? "",
    });
    setExpanded((prev) => new Set(prev).add(parent.id));
    setImageFile(null);
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setModalMode(task.parent_id ? "sub" : "parent");
    setForm({
      title: task.title,
      description: task.description ?? "",
      client_id: task.client_id ?? "",
      parent_id: task.parent_id ?? "",
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to ?? "",
      start_date: task.start_date ?? "",
      due_date: task.due_date ?? "",
      duration_days: String(task.duration_days),
      progress: String(task.progress),
    });
    setImageFile(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    let image_url = editing?.image_url ?? null;

    if (imageFile) {
      const uploaded = await uploadFile(imageFile, "tasks");
      if (uploaded) image_url = uploaded.url;
    }

    const payload = {
      title: form.title,
      description: form.description || null,
      client_id: form.client_id || null,
      parent_id: form.parent_id || null,
      status: form.status,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      duration_days: parseInt(form.duration_days) || 1,
      progress: parseInt(form.progress) || 0,
      image_url,
    };

    if (editing) {
      await supabase.from("tasks").update(payload).eq("id", editing.id);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("tasks").insert({ ...payload, created_by: user?.id });
    }

    await logActivity(editing ? "update" : "create", "task", editing?.id ?? null, form.title);
    if (form.assigned_to && form.assigned_to !== editing?.assigned_to) {
      await notifyUser(form.assigned_to, "📋 มอบหมายงานใหม่", form.title, "/tasks");
    }

    setSaving(false);
    setModalOpen(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("ลบงานนี้? (งานย่อยจะถูกลบด้วย)")) return;
    const supabase = createClient();
    await supabase.from("tasks").delete().eq("id", id);
    loadData();
  }

  async function quickStatusChange(id: string, status: TaskStatus) {
    const supabase = createClient();
    await supabase.from("tasks").update({ status }).eq("id", id);
    loadData();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function taskMatchesFilter(task: Task): boolean {
    if (statusFilter === "all") return true;
    return task.status === statusFilter;
  }

  function parentVisible(parent: Task): boolean {
    if (taskMatchesFilter(parent)) return true;
    const subs = subtasksByParent[parent.id] ?? [];
    return subs.some(taskMatchesFilter);
  }

  const visibleParents = parentTasks.filter(parentVisible);

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
        title="งาน"
        description="งานใหญ่รับผิดชอบร่วมกัน · แบ่งงานย่อยมอบหมายทีม"
        action={
          <Button onClick={openCreateParent}>
            <Plus size={18} /> เพิ่มงานใหญ่
          </Button>
        }
      />

      <FilterTabs
        active={viewMode === "kanban" ? "kanban" : statusFilter}
        onChange={(k) => {
          if (k === "kanban") setViewMode("kanban");
          else { setViewMode("list"); setStatusFilter(k); }
        }}
        tabs={[
          { key: "kanban", label: "Kanban" },
          { key: "all", label: "ทั้งหมด", count: tasks.length },
          ...Object.entries(TASK_STATUS_LABELS).map(([k, v]) => ({
            key: k,
            label: v,
            count: tasks.filter((t) => t.status === k).length,
          })),
        ]}
      />

      {viewMode === "kanban" ? (
        <KanbanBoard tasks={tasks} onStatusChange={quickStatusChange} />
      ) : visibleParents.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={28} />}
          title="ยังไม่มีงาน"
          description="เพิ่มงานใหญ่ แล้วแบ่งเป็นงานย่อยมอบหมายทีม"
        />
      ) : (
        <div className="space-y-4">
          {visibleParents.map((parent) => {
            const subs = (subtasksByParent[parent.id] ?? []).filter(taskMatchesFilter);
            const isOpen = expanded.has(parent.id);
            const subProgress =
              subs.length > 0
                ? Math.round(subs.reduce((s, t) => s + t.progress, 0) / subs.length)
                : parent.progress;

            return (
              <div
                key={parent.id}
                className="bg-card border border-brand rounded-2xl overflow-hidden hover:border-accent/40 transition-all"
              >
                <div className="p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <button
                      onClick={() => toggleExpand(parent.id)}
                      className="p-1 rounded hover:bg-card-hover text-muted mt-0.5"
                    >
                      {subs.length > 0 ? (
                        isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />
                      ) : (
                        <ListTree size={16} className="opacity-40" />
                      )}
                    </button>
                    <div className="flex-1">
                      <TaskRow
                        task={parent}
                        profiles={profiles}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onAddSub={openCreateSub}
                        onStatusChange={quickStatusChange}
                      />
                    </div>
                  </div>

                  {subs.length > 0 && (
                    <div className="ml-8 flex items-center gap-2 text-xs text-muted">
                      <span>{subs.length} งานย่อย</span>
                      <span>·</span>
                      <span>ความคืบหน้ารวม {subProgress}%</span>
                      <div className="flex -space-x-1">
                        {subs
                          .filter((s) => s.assignee)
                          .slice(0, 4)
                          .map((s) =>
                            s.assignee ? (
                              <Avatar key={s.id} name={s.assignee.display_name} size="sm" />
                            ) : null
                          )}
                      </div>
                    </div>
                  )}
                </div>

                {isOpen && subs.length > 0 && (
                  <div className="border-t border-border bg-background/50 p-4 space-y-3">
                    {subs.map((sub) => (
                      <TaskRow
                        key={sub.id}
                        task={sub}
                        isSub
                        profiles={profiles}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onAddSub={openCreateSub}
                        onStatusChange={quickStatusChange}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editing
            ? "แก้ไขงาน"
            : modalMode === "sub"
              ? "เพิ่มงานย่อย"
              : "เพิ่มงานใหญ่"
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          {modalMode === "sub" && form.parent_id && (
            <div className="px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm">
              งานย่อยของ:{" "}
              <strong>
                {parentTasks.find((p) => p.id === form.parent_id)?.title ?? "—"}
              </strong>
            </div>
          )}

          <Input
            label="ชื่องาน *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={
              modalMode === "sub"
                ? "เช่น API Login, หน้า Dashboard"
                : "เช่น แอพสั่งอาหาร Phase 1"
            }
            required
          />
          <Textarea
            label="รายละเอียด"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
          <Select
            label="ลูกค้า"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
          >
            <option value="">— ไม่ระบุ —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          {modalMode === "parent" && !editing && (
            <Select
              label="ประเภท"
              value={form.parent_id ? "sub" : "parent"}
              onChange={(e) =>
                setForm({
                  ...form,
                  parent_id: e.target.value === "sub" ? parentTasks[0]?.id ?? "" : "",
                })
              }
            >
              <option value="parent">งานใหญ่ (รับผิดชอบร่วมกัน)</option>
              {parentTasks.length > 0 && (
                <option value="sub">งานย่อยภายใต้งานใหญ่</option>
              )}
            </Select>
          )}

          {form.parent_id && modalMode === "parent" && !editing && (
            <Select
              label="งานใหญ่"
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            >
              {parentTasks.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </Select>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="สถานะ" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
              {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <Select label="ความสำคัญ" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>

          <Select
            label="มอบหมายให้"
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
          >
            <option value="">— ยังไม่มอบหมาย / ทีมร่วม —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} (@{p.username})
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="เริ่ม" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input label="ครบกำหนด" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <Input label="ระยะ (วัน)" type="number" min="1" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
          </div>
          <Input label="ความคืบหน้า (%)" type="number" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />

          <Button type="submit" loading={saving} className="w-full">
            {editing ? "บันทึก" : modalMode === "sub" ? "เพิ่มงานย่อย" : "เพิ่มงานใหญ่"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
