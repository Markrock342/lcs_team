"use client";

import { useEffect, useState } from "react";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { neonRequest } from "@/lib/neon/client";
import { useRole } from "@/components/RoleProvider";
import type { TaskChecklistItem } from "@/lib/types";

type Props = {
  taskId: string;
  onProgressChange?: (percent: number) => void;
};

function calcProgress(items: TaskChecklistItem[]) {
  if (!items.length) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

export function TaskChecklist({ taskId, onProgressChange }: Props) {
  const { canEdit } = useRole();
  const [items, setItems] = useState<TaskChecklistItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");

  async function load() {
    try {
      const { items: data } = await neonRequest<{ items: TaskChecklistItem[] }>(
        `/api/neon/checklist?taskId=${encodeURIComponent(taskId)}`,
        { cache: "no-store" }
      );
      const list = data ?? [];
      setItems(list);
      onProgressChange?.(calcProgress(list));
    } catch (error) {
      setDbError(error instanceof Error ? error.message : "โหลดรายการตรวจไม่สำเร็จ");
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  useEffect(() => {
    // Loading happens after mount and task changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function syncProgress(list: TaskChecklistItem[]) {
    const percent = calcProgress(list);
    onProgressChange?.(percent);
    await neonRequest("/api/neon/tasks", {
      method: "PATCH",
      body: JSON.stringify({ id: taskId, progress: percent }),
    });
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const { item: data } = await neonRequest<{ item: TaskChecklistItem }>("/api/neon/checklist", {
        method: "POST",
        body: JSON.stringify({
        task_id: taskId,
        title,
        sort_order: items.length,
        }),
      });
    const next = [...items, data as TaskChecklistItem];
    setItems(next);
    setNewTitle("");
    await syncProgress(next);
    } catch (error) {
      setDbError(error instanceof Error ? error.message : "เพิ่มรายการตรวจไม่สำเร็จ");
    }
  }

  async function toggleItem(item: TaskChecklistItem) {
    await neonRequest("/api/neon/checklist", {
      method: "PATCH",
      body: JSON.stringify({ id: item.id, done: !item.done }),
    });

    const next = items.map((i) =>
      i.id === item.id ? { ...i, done: !i.done } : i
    );
    setItems(next);
    await syncProgress(next);
  }

  async function removeItem(id: string) {
    await neonRequest("/api/neon/checklist", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    await syncProgress(next);
  }

  if (loading) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">รายการตรวจ</p>
      {dbError && (
        <p className="text-xs text-amber-400">{dbError}</p>
      )}
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border group"
          >
            <GripVertical size={14} className="text-muted/40 shrink-0" />
            <button
              type="button"
              onClick={() => canEdit && toggleItem(item)}
              disabled={!canEdit}
              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 touch-manipulation disabled:cursor-default ${
                item.done
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                  : "border-border text-transparent"
              }`}
            >
              <Check size={12} />
            </button>
            <span
              className={`flex-1 text-sm ${
                item.done ? "line-through text-muted" : ""
              }`}
            >
              {item.title}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded text-muted hover:text-red-400 touch-manipulation"
                aria-label={`ลบ ${item.title}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form onSubmit={addItem} className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="เพิ่มรายการตรวจ..."
            aria-label="เพิ่มรายการตรวจ"
            className="flex-1 min-h-11 px-3 py-2 rounded-lg bg-background border border-border text-sm"
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent/15 text-accent text-sm font-medium disabled:opacity-40"
            aria-label="เพิ่มรายการ"
          >
            <Plus size={16} />
          </button>
        </form>
      )}
    </div>
  );
}
