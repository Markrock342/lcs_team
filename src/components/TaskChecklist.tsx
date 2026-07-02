"use client";

import { useEffect, useState } from "react";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  const [items, setItems] = useState<TaskChecklistItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    load();
  }, [taskId]);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("task_checklist_items")
      .select("*")
      .eq("task_id", taskId)
      .order("sort_order", { ascending: true });

    if (error?.message.includes("relation")) {
      setDbError("รัน supabase/add-productivity-features.sql");
      setLoading(false);
      return;
    }

    const list = (data ?? []) as TaskChecklistItem[];
    setItems(list);
    onProgressChange?.(calcProgress(list));
    setLoading(false);
  }

  async function syncProgress(list: TaskChecklistItem[]) {
    const percent = calcProgress(list);
    onProgressChange?.(percent);
    const supabase = createClient();
    await supabase.from("tasks").update({ progress: percent }).eq("id", taskId);
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("task_checklist_items")
      .insert({
        task_id: taskId,
        title,
        sort_order: items.length,
      })
      .select()
      .single();

    if (error || !data) return;
    const next = [...items, data as TaskChecklistItem];
    setItems(next);
    setNewTitle("");
    await syncProgress(next);
  }

  async function toggleItem(item: TaskChecklistItem) {
    const supabase = createClient();
    const { error } = await supabase
      .from("task_checklist_items")
      .update({ done: !item.done })
      .eq("id", item.id);
    if (error) return;

    const next = items.map((i) =>
      i.id === item.id ? { ...i, done: !i.done } : i
    );
    setItems(next);
    await syncProgress(next);
  }

  async function removeItem(id: string) {
    const supabase = createClient();
    await supabase.from("task_checklist_items").delete().eq("id", id);
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    await syncProgress(next);
  }

  if (loading) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">Checklist</p>
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
              onClick={() => toggleItem(item)}
              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 touch-manipulation ${
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
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 touch-manipulation"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={addItem} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="เพิ่มรายการ checklist..."
          className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm"
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="px-3 py-2 rounded-lg bg-accent/15 text-accent text-sm font-medium disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
      </form>
    </div>
  );
}
