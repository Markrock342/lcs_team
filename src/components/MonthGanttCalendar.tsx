"use client";

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
import { Avatar } from "@/components/ui";

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
            className="py-3 text-center text-xs font-semibold text-muted"
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
                          ? "bg-accent text-on-accent ring-2 ring-accent/35 ring-offset-2 ring-offset-card"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted/50"
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
                  return (
                    <div
                      key={`${seg.task.id}-${wi}`}
                      className={`absolute mx-0.5 flex items-center gap-1 truncate border px-2 text-xs font-semibold ${color.bg} ${color.text} ${color.border} ${
                        seg.continuesBefore ? "rounded-l-sm" : "rounded-l-lg"
                      } ${seg.continuesAfter ? "rounded-r-sm" : "rounded-r-lg"} rounded-lg shadow-sm`}
                      style={{
                        left: `calc(${(seg.colStart / 7) * 100}% + 2px)`,
                        width: `calc(${(seg.colSpan / 7) * 100}% - 4px)`,
                        top: seg.lane * (BAR_H + LANE_GAP) + 5,
                        height: isSub ? 20 : BAR_H,
                        zIndex: seg.lane + 1,
                      }}
                      title={`${seg.task.title}\n${seg.task.start_date} → ${seg.task.due_date}${seg.task.assignee ? `\n@${seg.task.assignee.display_name}` : ""}`}
                    >
                      {!seg.continuesBefore && (
                        <span className="truncate drop-shadow-sm">{seg.task.title}</span>
                      )}
                    </div>
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

      {/* Legend */}
      {hasTasks && (
        <div className="space-y-3 border-t border-border bg-surface-raised px-4 py-4">
          <p className="text-sm font-semibold text-foreground">งานในเดือนนี้</p>
          <div className="flex flex-wrap gap-2">
            {scheduled.map((t) => {
              const tl = taskLanes.find((x) => x.task.id === t.id);
              const color = TASK_BAR_COLORS[tl?.colorIndex ?? 0];
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs"
                >
                  <div className={`w-3 h-3 rounded-sm border ${color.bg} ${color.border}`} />
                  <span className="max-w-[120px] truncate text-foreground">{t.title}</span>
                  {t.parent_id && (
                    <span className="text-xs text-muted">(ย่อย)</span>
                  )}
                  {t.assignee && (
                    <Avatar name={t.assignee.display_name} src={t.assignee.avatar_url} size="sm" />
                  )}
                  <span className="text-xs text-muted">
                    {t.start_date?.slice(5)}–{t.due_date?.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            งานทับกันแสดงคนละแถว · สีสว่าง = งาน · แถบบาง = งานย่อย
          </p>
        </div>
      )}
    </section>
  );
}
