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
  LayoutGrid,
  List,
  Search,
  Clock,
  Paperclip,
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
import { PageHeader, FilterTabs, FilterSelect, RowMenu } from "@/components/mobile-ui";
import { KanbanBoard } from "@/components/KanbanBoard";
import { TimeTracker } from "@/components/TimeTracker";
import { TaskCountdown } from "@/components/TaskCountdown";
import { TaskChecklist } from "@/components/TaskChecklist";
import { TaskAttachments } from "@/components/TaskAttachments";
import { useRole } from "@/components/RoleProvider";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/lib/constants";
import {
  dueDateFromStart,
  daysBetweenInclusive,
  suggestedStatusOnSave,
} from "@/lib/task-schedule";
import { uploadFile } from "@/lib/upload";
import { logActivity } from "@/lib/activity";
import { sendNotification } from "@/lib/notifications";
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

function renderDescriptionText(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function TaskDescription({ text, isSub }: { text: string; isSub?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 90 || text.includes("\n");

  return (
    <div className="mt-1.5">
      <p
        className={`text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed ${
          !expanded && isLong ? (isSub ? "line-clamp-3" : "line-clamp-2") : ""
        }`}
      >
        {renderDescriptionText(text)}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-accent hover:underline mt-1 touch-manipulation"
        >
          {expanded ? "ย่อ" : "ดูทั้งหมด"}
        </button>
      )}
    </div>
  );
}

function TaskChip({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors touch-manipulation ${
        active
          ? "bg-accent/15 border-accent/40 text-accent"
          : "bg-background border-border text-muted hover:text-foreground hover:border-accent/30"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span
          className={`px-1 rounded text-[10px] ${
            active ? "bg-accent/20" : "bg-card-hover"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function TaskRow({
  task,
  isSub,
  profiles,
  currentUserId,
  checklistCount,
  attachmentCount,
  readOnly,
  onEdit,
  onDelete,
  onAddSub,
  onStatusChange,
  onChecklistProgress,
  onAttachmentsChange,
}: {
  task: Task;
  isSub?: boolean;
  profiles: Profile[];
  currentUserId?: string;
  checklistCount?: { total: number; done: number };
  attachmentCount?: number;
  readOnly?: boolean;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onAddSub: (parent: Task) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onChecklistProgress?: () => void;
  onAttachmentsChange?: () => void;
}) {
  const [panel, setPanel] = useState<null | "time" | "checklist" | "files">(null);
  const toggle = (p: "time" | "checklist" | "files") =>
    setPanel((prev) => (prev === p ? null : p));

  const clTotal = checklistCount?.total ?? 0;
  const clDone = checklistCount?.done ?? 0;
  const atCount = attachmentCount ?? 0;

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-start gap-3 ${
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
          {task.client?.name ?? "ไม่ระบุลูกค้า"}
          {!task.start_date && !task.due_date && (
            <> · <span className="text-accent">{task.duration_days} วัน</span></>
          )}
        </p>
        <div className="mt-2">
          <TaskCountdown
            startDate={task.start_date}
            dueDate={task.due_date}
            status={task.status}
          />
        </div>
        {task.description && (
          <TaskDescription text={task.description} isSub={isSub} />
        )}

        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {!isSub && !readOnly && (
            <TaskChip
              active={panel === "time"}
              onClick={() => toggle("time")}
              icon={<Clock size={13} />}
              label="เวลา"
            />
          )}
          {!isSub && (
            <TaskChip
              active={panel === "checklist"}
              onClick={() => toggle("checklist")}
              icon={<CheckSquare size={13} />}
              label="Checklist"
              badge={clTotal > 0 ? `${clDone}/${clTotal}` : undefined}
            />
          )}
          <TaskChip
            active={panel === "files"}
            onClick={() => toggle("files")}
            icon={<Paperclip size={13} />}
            label="ไฟล์"
            badge={atCount > 0 ? String(atCount) : undefined}
          />
        </div>

        {panel && (
          <div className="mt-2 rounded-xl border border-border bg-background/50 p-3">
            {panel === "time" && !isSub && (
              <TimeTracker taskId={task.id} taskTitle={task.title} />
            )}
            {panel === "checklist" && !isSub && (
              <TaskChecklist
                taskId={task.id}
                onProgressChange={onChecklistProgress}
              />
            )}
            {panel === "files" && (
              <TaskAttachments
                taskId={task.id}
                currentUserId={currentUserId}
                onChange={onAttachmentsChange}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {task.assignee ? (
          <Avatar name={task.assignee.display_name} src={task.assignee.avatar_url} size="sm" />
        ) : (
          <span className="text-xs text-muted">ยังไม่มอบหมาย</span>
        )}

        {readOnly ? (
          <StatusBadge status={task.status} />
        ) : (
          <select
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
            className="text-xs px-2 py-2 bg-background border border-border rounded-lg min-h-[40px] touch-manipulation"
          >
            {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}

        {!readOnly && (
          <RowMenu
            items={[
              ...(!isSub
                ? [
                    {
                      label: "เพิ่มงานย่อย",
                      icon: <Plus size={15} />,
                      onClick: () => onAddSub(task),
                    },
                  ]
                : []),
              {
                label: "แก้ไข",
                icon: <Pencil size={15} />,
                onClick: () => onEdit(task),
              },
              {
                label: "ลบ",
                icon: <Trash2 size={15} />,
                onClick: () => onDelete(task.id),
                danger: true,
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { canEdit } = useRole();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pastedImages, setPastedImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("status");
    if (q && (q === "all" || q === "active" || q in TASK_STATUS_LABELS)) {
      setStatusFilter(q);
    }
    const client = params.get("client");
    if (client) setClientFilter(client);
  }, []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<"parent" | "sub">("parent");
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [checklistCounts, setChecklistCounts] = useState<
    Record<string, { total: number; done: number }>
  >({});
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadData();
    createClient()
      .auth.getUser()
      .then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  async function loadCounts() {
    const supabase = createClient();
    const [checklistRes, attachRes] = await Promise.all([
      supabase.from("task_checklist_items").select("task_id, done"),
      supabase.from("task_attachments").select("task_id"),
    ]);

    const cl: Record<string, { total: number; done: number }> = {};
    for (const row of (checklistRes.data ?? []) as { task_id: string; done: boolean }[]) {
      const entry = cl[row.task_id] ?? { total: 0, done: 0 };
      entry.total += 1;
      if (row.done) entry.done += 1;
      cl[row.task_id] = entry;
    }
    setChecklistCounts(cl);

    const at: Record<string, number> = {};
    for (const row of (attachRes.data ?? []) as { task_id: string }[]) {
      at[row.task_id] = (at[row.task_id] ?? 0) + 1;
    }
    setAttachmentCounts(at);
  }

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
    loadCounts();

    const loaded = tasksRes.data ?? [];
    const withSubs = loaded
      .filter((t) => t.parent_id)
      .map((t) => t.parent_id as string);
    if (withSubs.length) {
      setExpanded(new Set(withSubs));
    }

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
    setPastedImages([]);
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
    setPastedImages([]);
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
    setPastedImages([]);
    setModalOpen(true);
  }

  function handleDescriptionPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) {
      e.preventDefault();
      setPastedImages((prev) => [...prev, ...files]);
    }
  }

  function onStartDateChange(start_date: string) {
    const duration = parseInt(form.duration_days) || 1;
    setForm({
      ...form,
      start_date,
      due_date: start_date ? dueDateFromStart(start_date, duration) : form.due_date,
    });
  }

  function onDurationChange(duration_days: string) {
    const duration = parseInt(duration_days) || 1;
    setForm({
      ...form,
      duration_days,
      due_date: form.start_date
        ? dueDateFromStart(form.start_date, duration)
        : form.due_date,
    });
  }

  function onDueDateChange(due_date: string) {
    setForm({
      ...form,
      due_date,
      duration_days:
        form.start_date && due_date
          ? String(daysBetweenInclusive(form.start_date, due_date))
          : form.duration_days,
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (modalMode === "sub" && !form.assigned_to) {
      return;
    }
    setSaving(true);
    const supabase = createClient();
    let image_url = editing?.image_url ?? null;

    if (imageFile) {
      const uploaded = await uploadFile(imageFile, "tasks");
      if (uploaded.ok) image_url = uploaded.url;
    }

    const payload = {
      title: form.title,
      description: form.description || null,
      client_id: form.client_id || null,
      parent_id: form.parent_id || null,
      status: suggestedStatusOnSave(form.start_date, form.status),
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      duration_days: parseInt(form.duration_days) || 1,
      progress: parseInt(form.progress) || 0,
      image_url,
    };

    let taskId = editing?.id ?? null;

    if (editing) {
      await supabase.from("tasks").update(payload).eq("id", editing.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: created } = await supabase
        .from("tasks")
        .insert({ ...payload, created_by: user?.id })
        .select("id")
        .single();
      taskId = created?.id ?? null;
    }

    if (pastedImages.length && taskId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const rows: {
        task_id: string;
        file_url: string;
        file_name: string;
        file_type: string | null;
        file_size: number;
        uploaded_by: string | null;
      }[] = [];
      for (const img of pastedImages) {
        const uploaded = await uploadFile(img, "tasks");
        if (uploaded.ok) {
          const ext = img.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
          rows.push({
            task_id: taskId,
            file_url: uploaded.url,
            file_name: img.name || `pasted-${Date.now()}.${ext}`,
            file_type: img.type || "image/png",
            file_size: img.size,
            uploaded_by: user?.id ?? null,
          });
        }
      }
      if (rows.length) {
        await supabase.from("task_attachments").insert(rows);
      }
    }

    await logActivity(editing ? "update" : "create", "task", taskId, form.title);
    if (form.assigned_to && form.assigned_to !== editing?.assigned_to && taskId) {
      const parentTitle =
        form.parent_id &&
        tasks.find((t) => t.id === form.parent_id)?.title;
      await sendNotification({
        userId: form.assigned_to,
        title: parentTitle
          ? "📋 งานย่อยใหม่"
          : "📋 มอบหมายงานใหม่",
        body: parentTitle
          ? `${form.title} · ${parentTitle}`
          : form.title,
        link: "/tasks",
        sourceType: "task",
        sourceId: taskId,
        kind: "task",
      });
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
    if (statusFilter === "all") {
      /* pass */
    } else if (statusFilter === "active") {
      if (task.status === "done") return false;
    } else if (task.status !== statusFilter) {
      return false;
    }

    if (clientFilter !== "all" && task.client_id !== clientFilter) return false;
    if (assigneeFilter !== "all" && task.assigned_to !== assigneeFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = [
        task.title,
        task.description ?? "",
        task.client?.name ?? "",
        task.assignee?.display_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
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
        description={
          canEdit
            ? "เปลี่ยนสถานะได้เลย · กด ⋯ เพื่อแก้ไขหรือเพิ่มงานย่อย"
            : "โหมดดูอย่างเดียว (Guest)"
        }
        action={
          canEdit ? (
            <Button onClick={openCreateParent}>
              <Plus size={18} /> เพิ่มงานใหญ่
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium min-h-[40px] touch-manipulation ${
              viewMode === "list"
                ? "bg-accent/20 text-accent border border-accent/40"
                : "bg-card border border-border text-muted"
            }`}
          >
            <List size={16} /> รายการ
          </button>
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium min-h-[40px] touch-manipulation ${
              viewMode === "kanban"
                ? "bg-accent/20 text-accent border border-accent/40"
                : "bg-card border border-border text-muted"
            }`}
          >
            <LayoutGrid size={16} /> Kanban
          </button>
        </div>

        {viewMode === "list" && (
          <>
            <div className="sm:hidden flex-1">
              <FilterSelect
                label="แสดง"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { key: "active", label: "กำลังทำ", count: tasks.filter((t) => t.status !== "done").length },
                  { key: "all", label: "ทั้งหมด", count: tasks.length },
                  ...Object.entries(TASK_STATUS_LABELS).map(([k, v]) => ({
                    key: k,
                    label: v,
                    count: tasks.filter((t) => t.status === k).length,
                  })),
                ]}
              />
            </div>
            <div className="hidden sm:block flex-1">
              <FilterTabs
                active={statusFilter}
                onChange={setStatusFilter}
                tabs={[
                  { key: "active", label: "กำลังทำ", count: tasks.filter((t) => t.status !== "done").length },
                  { key: "all", label: "ทั้งหมด", count: tasks.length },
                  ...Object.entries(TASK_STATUS_LABELS).map(([k, v]) => ({
                    key: k,
                    label: v,
                    count: tasks.filter((t) => t.status === k).length,
                  })),
                ]}
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหางาน, ลูกค้า, ผู้รับผิดชอบ..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-card border border-border text-sm"
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-card border border-border text-sm"
          >
            <option value="all">ทุกลูกค้า</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-card border border-border text-sm"
          >
            <option value="all">ทุกคน</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-card border border-border text-sm col-span-2 lg:col-span-1"
          >
            <option value="all">ทุกความสำคัญ</option>
            {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <KanbanBoard
          tasks={tasks}
          onStatusChange={canEdit ? quickStatusChange : () => {}}
        />
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
            const isOpen = expanded.has(parent.id) || subs.length === 0;
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
                        currentUserId={currentUserId}
                        checklistCount={checklistCounts[parent.id]}
                        attachmentCount={attachmentCounts[parent.id]}
                        readOnly={!canEdit}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onAddSub={openCreateSub}
                        onStatusChange={quickStatusChange}
                        onChecklistProgress={loadData}
                        onAttachmentsChange={loadCounts}
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
                              <Avatar key={s.id} name={s.assignee.display_name} src={s.assignee.avatar_url} size="sm" />
                            ) : null
                          )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border bg-background/40 px-4 py-3 ml-6 sm:ml-8">
                  {subs.length === 0 ? (
                    canEdit ? (
                      <button
                        type="button"
                        onClick={() => openCreateSub(parent)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-accent/40 text-accent text-sm font-medium hover:bg-accent/5 transition-colors touch-manipulation"
                      >
                        <Plus size={16} />
                        เพิ่มงานย่อย — มอบหมายเพื่อน
                      </button>
                    ) : (
                      <p className="text-xs text-muted text-center py-2">ยังไม่มีงานย่อย</p>
                    )
                  ) : isOpen ? (
                    <div className="space-y-3">
                      {subs.map((sub) => (
                        <TaskRow
                          key={sub.id}
                          task={sub}
                          isSub
                          profiles={profiles}
                          currentUserId={currentUserId}
                          checklistCount={checklistCounts[sub.id]}
                          attachmentCount={attachmentCounts[sub.id]}
                          readOnly={!canEdit}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                          onAddSub={openCreateSub}
                          onStatusChange={quickStatusChange}
                          onAttachmentsChange={loadCounts}
                        />
                      ))}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openCreateSub(parent)}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-accent hover:bg-accent/5 transition-colors touch-manipulation"
                        >
                          <Plus size={14} />
                          เพิ่มงานย่อย
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleExpand(parent.id)}
                      className="text-xs text-muted hover:text-accent"
                    >
                      แสดง {subs.length} งานย่อย
                    </button>
                  )}
                </div>
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
          <div className="space-y-2">
            <Textarea
              label="รายละเอียด"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              onPaste={handleDescriptionPaste}
              rows={modalMode === "sub" ? 8 : 4}
              className="min-h-[10rem] sm:min-h-[12rem] resize-y"
            />
            <p className="text-[11px] text-muted flex items-center gap-1">
              <Paperclip size={11} /> วางรูปจากคลิปบอร์ด (Ctrl/⌘+V) เพื่อแนบเข้างานได้เลย
            </p>
            {pastedImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pastedImages.map((img, idx) => {
                  const url = URL.createObjectURL(img);
                  return (
                    <div
                      key={idx}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`แนบ ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onLoad={() => URL.revokeObjectURL(url)}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPastedImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 touch-manipulation"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

          {modalMode === "parent" && !editing && parentTasks.length > 0 && form.parent_id && (
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
            label={modalMode === "sub" ? "มอบหมายให้ *" : "มอบหมายให้"}
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            required={modalMode === "sub"}
          >
            <option value="">
              {modalMode === "sub"
                ? "— เลือกเพื่อน —"
                : "— ยังไม่มอบหมาย / ทีมร่วม —"}
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} (@{p.username})
              </option>
            ))}
          </Select>

          {modalMode === "sub" && (
            <p className="text-xs text-muted -mt-2">
              เลือกเพื่อนแล้วกดบันทึก — จะแจ้งเตือนให้ทราบทันที
            </p>
          )}

          <div className="rounded-xl border border-accent/25 bg-accent/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-accent">กำหนดเวลางาน</p>
              <p className="text-xs text-muted mt-0.5">
                ใส่วันเริ่ม → ระบบคำนวณวันสิ้นสุดให้ · พอถึงวันเริ่มจะนับถอยหลังอัตโนมัติ
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="วันเริ่มงาน *"
                type="date"
                value={form.start_date}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
              <Input
                label="วันสิ้นสุดงาน"
                type="date"
                value={form.due_date}
                onChange={(e) => onDueDateChange(e.target.value)}
              />
              <Input
                label="ระยะ (วัน)"
                type="number"
                min="1"
                value={form.duration_days}
                onChange={(e) => onDurationChange(e.target.value)}
              />
            </div>
            {(form.start_date || form.due_date) && (
              <TaskCountdown
                startDate={form.start_date}
                dueDate={form.due_date}
                status={form.status}
                size="sm"
              />
            )}
          </div>
          <Input label="ความคืบหน้า (%)" type="number" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />

          {editing ? (
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <TaskAttachments
                taskId={editing.id}
                currentUserId={currentUserId}
                onChange={loadCounts}
              />
            </div>
          ) : (
            <p className="text-xs text-muted">
              บันทึกงานก่อน แล้วเปิดแก้ไขอีกครั้งเพื่อแนบไฟล์
            </p>
          )}

          <Button type="submit" loading={saving} className="w-full">
            {editing ? "บันทึก" : modalMode === "sub" ? "เพิ่มงานย่อย" : "เพิ่มงานใหญ่"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
