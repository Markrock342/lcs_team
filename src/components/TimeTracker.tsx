"use client";

import { useEffect, useState } from "react";
import { Play, Square, Clock } from "lucide-react";
import { useRole } from "@/components/RoleProvider";
import { neonRequest } from "@/lib/neon/client";
import { logActivity } from "@/lib/activity";
import type { TimeEntry } from "@/lib/extras-types";

export function TimeTracker({
  taskId,
  taskTitle,
}: {
  taskId: string;
  taskTitle: string;
}) {
  const { profile } = useRole();
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    void loadEntries();
    // Reload only when switching tasks; the profile is server-populated before render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { entries: data } = await neonRequest<{ entries: TimeEntry[] }>(
        `/api/neon/time-entries?taskId=${encodeURIComponent(taskId)}`,
        { cache: "no-store" },
      );
      setEntries(data);
      const running = data.find((e) => !e.ended_at && e.user_id === profile?.id);
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
    if (!profile) return;
    const { entry } = await neonRequest<{ entry: TimeEntry }>("/api/neon/time-entries", {
      method: "POST",
      body: JSON.stringify({ task_id: taskId, started_at: new Date().toISOString() }),
    });
    if (entry) {
      setActive(entry);
      setElapsed(0);
      await logActivity("create", "time_entry", entry.id, taskTitle);
    }
  }

  async function stop() {
    if (!active) return;
    const ended = new Date().toISOString();
    const mins = Math.round(elapsed / 60);
    await neonRequest("/api/neon/time-entries", {
      method: "PATCH",
      body: JSON.stringify({ id: active.id, ended_at: ended, duration_minutes: mins }),
    });
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
