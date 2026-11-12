"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { addMonths, subMonths } from "date-fns";
import { th } from "date-fns/locale";
import type { Task } from "@/lib/types";
import { TASK_BAR_COLORS } from "@/lib/constants";
import {
  getMonthWeeks,
  assignTaskLanes,
  getWeekSegments,
  maxLaneCount,
  isSameMonth,
  isToday,
  format,
} from "@/lib/calendar-utils";
import { formatTaskDate } from "@/lib/task-schedule";

const DAY_LABELS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const BAR_H = 24;
const LANE_GAP = 5;

interface MonthGanttCalendarProps {
  month: Date;
  tasks: Task[];
  onMonthChange: (d: Date) => void;
}

export function MonthGanttCalendar({
  month,
  tasks,
  onMonthChange,
}: MonthGanttCalendarProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const weeks = getMonthWeeks(month);
  const scheduled = tasks.filter(
    (t) => t.start_date && t.due_date && t.status !== "done"
  );
  const taskLanes = assignTaskLanes(scheduled);
  const lanes = maxLaneCount(taskLanes);
  const ganttHeight = Math.max(lanes, 1) * (BAR_H + LANE_GAP) + 10;
  const hasTasks = scheduled.length > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface-raised px-4 py-3.5">
        <button
          onClick={() => onMonthChange(subMonths(month, 1))}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-card-hover"
          aria-label="เดือนก่อนหน้า"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-foreground">
          {format(month, "MMMM yyyy", { locale: th })}
        </h2>
        <button
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-card-hover"
          aria-label="เดือนถัดไป"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-border bg-surface-soft">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-3 text-center text-[0.8125rem] font-semibold text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => {
        const segments = getWeekSegments(week, taskLanes);
        const weekAlt = wi % 2 === 0;

        return (
          <div
            key={wi}
            className={`border-b border-border last:border-b-0 ${
              weekAlt ? "bg-card" : "bg-surface-soft"
            }`}
          >
            {/* Day numbers */}
            <div className="grid grid-cols-7">
              {week.days.map((day) => {
                const inMonth = isSameMonth(day, month);
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[46px] border-r border-border px-0.5 pb-1 pt-2 text-center last:border-r-0 ${
                      !inMonth ? "bg-background/45" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 text-sm font-semibold rounded-full ${
                        today
                          ? "bg-accent text-on-accent ring-2 ring-accent/35 ring-offset-1 ring-offset-card"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted/70"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Gantt bars — only when there are tasks */}
            {hasTasks && (
              <div
                className="relative border-t border-border bg-background/30"
                style={{ height: segments.length > 0 ? ganttHeight : 36 }}
              >
                {/* Column guides */}
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {week.days.map((day) => (
                    <div
                      key={`grid-${day.toISOString()}`}
                      className={`border-r border-border/70 last:border-r-0 ${
                        !isSameMonth(day, month) ? "bg-background/35" : ""
                      }`}
                    />
                  ))}
                </div>

                {segments.map((seg) => {
                  const color = TASK_BAR_COLORS[seg.colorIndex];
                  const isSub = !!seg.task.parent_id;
                  const active = selectedId === seg.task.id;
                  return (
                    <button
                      type="button"
                      key={`${seg.task.id}-${wi}`}
                      onClick={() => setSelectedId(active ? null : seg.task.id)}
                      aria-pressed={active}
                      aria-label={`${seg.task.title} ${formatTaskDate(seg.task.start_date)} ถึง ${formatTaskDate(seg.task.due_date)}`}
                      className={`absolute mx-0.5 flex items-center gap-1 overflow-hidden border px-1.5 text-left text-xs font-semibold sm:px-2 ${color.bg} ${color.text} ${color.border} ${
                        seg.continuesBefore ? "rounded-l-sm" : "rounded-l-lg"
                      } ${seg.continuesAfter ? "rounded-r-sm" : "rounded-r-lg"} shadow-sm ${
                        active ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : ""
                      } ${selectedId && !active ? "opacity-45" : ""}`}
                      style={{
                        left: `calc(${(seg.colStart / 7) * 100}% + 2px)`,
                        width: `calc(${(seg.colSpan / 7) * 100}% - 4px)`,
                        top: seg.lane * (BAR_H + LANE_GAP) + 5,
                        height: isSub ? 22 : BAR_H,
                        zIndex: seg.lane + 1,
                      }}
                    >
                      <span className="truncate">{seg.task.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state — once, compact */}
      {!hasTasks && (
        <div className="flex flex-col items-center justify-center border-t border-border bg-surface-soft px-4 py-9 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--status-blue-bg)] text-[var(--status-blue-fg)]">
            <CalendarDays size={24} />
          </div>
          <p className="text-sm font-semibold text-foreground">ยังไม่มีงานที่มีวันที่ในปฏิทิน</p>
          <p className="mt-1 text-sm text-muted">
            ใส่วันเริ่ม-ครบที่หน้างาน แล้วจะเห็นแถบสีตรงนี้
          </p>
        </div>
      )}

      {/* รายการงาน — แตะเพื่อไฮไลต์แถบในปฏิทิน */}
      {hasTasks && (
        <div className="border-t border-border bg-surface-raised">
          <div className="px-4 pb-2 pt-4">
            <p className="text-base font-semibold text-foreground">งานที่มีกำหนด ({scheduled.length})</p>
            <p className="text-sm text-muted">แตะแถบสีหรือชื่องานเพื่อดูว่าอยู่ช่วงไหนของปฏิทิน</p>
          </div>
          <ul className="divide-y divide-border">
            {scheduled.map((t) => {
              const tl = taskLanes.find((x) => x.task.id === t.id);
              const color = TASK_BAR_COLORS[tl?.colorIndex ?? 0];
              const active = selectedId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(active ? null : t.id)}
                    aria-pressed={active}
                    className={`flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left touch-manipulation ${
                      active ? "bg-accent/10" : "hover:bg-card-hover"
                    }`}
                  >
                    <span className={`mt-1 size-4 shrink-0 rounded border ${color.bg} ${color.border}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium leading-snug wrap-anywhere">
                        {t.title}
                        {t.parent_id && <span className="font-normal text-muted"> (งานย่อย)</span>}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {formatTaskDate(t.start_date)} → {formatTaskDate(t.due_date)}
                        {t.assignee ? ` · ${t.assignee.display_name}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
