"use client";

import { useEffect, useState } from "react";
import { Clock, CalendarDays } from "lucide-react";
import {
  COUNTDOWN_TONE_CLASS,
  formatTaskDate,
  getTaskCountdown,
} from "@/lib/task-schedule";

type Props = {
  startDate?: string | null;
  dueDate?: string | null;
  status?: string;
  showDates?: boolean;
  size?: "sm" | "md";
};

export function TaskCountdown({
  startDate,
  dueDate,
  status,
  showDates = true,
  size = "md",
}: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const info = getTaskCountdown({
    start_date: startDate,
    due_date: dueDate,
    status,
  });

  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-lg border font-semibold ${pad} ${COUNTDOWN_TONE_CLASS[info.tone]}`}
      >
        <Clock size={size === "sm" ? 11 : 13} />
        {info.label}
      </span>
      {showDates && (startDate || dueDate) && (
        <span className="inline-flex items-center gap-1 text-muted bg-background/60 border border-border rounded-lg px-2 py-0.5 text-[11px]">
          <CalendarDays size={11} />
          {startDate ? formatTaskDate(startDate) : "—"}
          {startDate && dueDate && <span className="opacity-50">→</span>}
          {dueDate ? formatTaskDate(dueDate) : startDate ? "—" : ""}
        </span>
      )}
      {info.detail && info.tone !== "muted" && !showDates && (
        <span className="text-[11px] text-muted">{info.detail}</span>
      )}
    </div>
  );
}
