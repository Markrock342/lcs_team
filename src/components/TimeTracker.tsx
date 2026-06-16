"use client";

import { useEffect, useState } from "react";
import { Play, Square, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logActivity } from "@/lib/activity";
import type { TimeEntry } from "@/lib/extras-types";

export function TimeTracker({
  taskId,
  taskTitle,
}: {
  taskId: string;
  taskTitle: string;
}) {
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    loadEntries();
  }, [taskId]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setElapsed(
        Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000)
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  async function loadEntries() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("task_id", taskId)
        .order("started_at", { ascending: false })
        .limit(5);
      setEntries(data ?? []);
      const running = data?.find((e) => !e.ended_at && e.user_id === user?.id);
      if (running) {
        setActive(running);
        setElapsed(
          Math.floor((Date.now() - new Date(running.started_at).getTime()) / 1000)
        );
      }
    } catch {
      // ignore
    }
  }

  async function start() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("time_entries")
      .insert({ task_id: taskId, user_id: user.id, started_at: new Date().toISOString() })
      .select()
      .single();
    if (data) {
      setActive(data);
      setElapsed(0);
      await logActivity("create", "time_entry", data.id, taskTitle);
    }
  }

  async function stop() {
    if (!active) return;
    const supabase = createClient();
    const ended = new Date().toISOString();
    const mins = Math.round(elapsed / 60);
    await supabase
      .from("time_entries")
      .update({ ended_at: ended, duration_minutes: mins })
      .eq("id", active.id);
    setActive(null);
    setElapsed(0);
    loadEntries();
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const totalMins = entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Clock size={14} className="text-muted shrink-0" />
      {active ? (
        <>
          <span className="text-sm font-mono text-accent">{fmt(elapsed)}</span>
          <button
            onClick={stop}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30"
          >
            <Square size={12} /> หยุด
          </button>
        </>
      ) : (
        <button
          onClick={start}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/20 text-accent text-xs hover:bg-accent/30"
        >
          <Play size={12} /> จับเวลา
        </button>
      )}
      {totalMins > 0 && (
        <span className="text-[10px] text-muted">รวม {totalMins} นาที</span>
      )}
    </div>
  );
}
