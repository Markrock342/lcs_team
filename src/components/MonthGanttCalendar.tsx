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
    <div className="bg-[#0d1a30] border border-[#2a5080]/60 rounded-2xl overflow-hidden shadow-lg shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a5080]/50 bg-[#112240]">
        <button
          onClick={() => onMonthChange(subMonths(month, 1))}
          className="p-2 rounded-lg hover:bg-white/10 text-zinc-200"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="font-semibold text-lg text-white">
          {format(month, "MMMM yyyy", { locale: th })}
        </h2>
        <button
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="p-2 rounded-lg hover:bg-white/10 text-zinc-200"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-[#2a5080]/50 bg-[#152848]">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-2.5 text-center text-xs font-semibold text-[#8bb4d9]"
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
            className={`border-b border-[#2a5080]/30 last:border-b-0 ${
              weekAlt ? "bg-[#0d1a30]" : "bg-[#101f38]"
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
                    className={`min-h-[40px] px-0.5 pt-2 pb-1 text-center border-r border-[#2a5080]/25 last:border-r-0 ${
                      !inMonth ? "bg-black/15" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 text-sm font-semibold rounded-full ${
                        today
                          ? "bg-accent text-white ring-2 ring-accent/40 shadow-[0_0_12px_rgba(0,163,255,0.4)]"
                          : inMonth
                            ? "text-zinc-100"
                            : "text-zinc-600"
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
                className="relative border-t border-[#2a5080]/20 bg-[#0a1525]/60"
                style={{ height: segments.length > 0 ? ganttHeight : 36 }}
              >
                {/* Column guides */}
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {week.days.map((day, i) => (
                    <div
                      key={`grid-${day.toISOString()}`}
                      className={`border-r border-[#2a5080]/15 last:border-r-0 ${
                        !isSameMonth(day, month) ? "bg-black/10" : ""
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
                      className={`absolute mx-0.5 px-2 flex items-center gap-1 text-[10px] sm:text-xs font-medium truncate backdrop-blur-sm ${color.bg} ${color.text} border ${color.border} ${
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
        <div className="flex flex-col items-center justify-center py-8 px-4 border-t border-[#2a5080]/30 bg-[#0a1525]/40">
          <CalendarDays className="text-[#4a8ab8] mb-2" size={28} />
          <p className="text-sm text-zinc-300">ยังไม่มีงานที่มีวันที่ในปฏิทิน</p>
          <p className="text-xs text-zinc-500 mt-1">
            ใส่วันเริ่ม-ครบที่หน้างาน แล้วจะเห็นแถบสีตรงนี้
          </p>
        </div>
      )}

      {/* Legend */}
      {hasTasks && (
        <div className="px-4 py-3 border-t border-[#2a5080]/40 bg-[#112240] space-y-2">
          <p className="text-xs text-[#8bb4d9] font-medium">งานในเดือนนี้</p>
          <div className="flex flex-wrap gap-2">
            {scheduled.map((t) => {
              const tl = taskLanes.find((x) => x.task.id === t.id);
              const color = TASK_BAR_COLORS[tl?.colorIndex ?? 0];
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 text-xs bg-[#0d1a30] border border-[#2a5080]/40 rounded-lg px-2.5 py-1.5"
                >
                  <div className={`w-3 h-3 rounded-sm border ${color.bg} ${color.border}`} />
                  <span className="truncate max-w-[120px] text-zinc-200">{t.title}</span>
                  {t.parent_id && (
                    <span className="text-[10px] text-zinc-500">(ย่อย)</span>
                  )}
                  {t.assignee && (
                    <Avatar name={t.assignee.display_name} size="sm" />
                  )}
                  <span className="text-zinc-500 text-[10px]">
                    {t.start_date?.slice(5)}–{t.due_date?.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-500">
            งานทับกันแสดงคนละแถว · สีสว่าง = งาน · แถบบาง = งานย่อย
          </p>
        </div>
      )}
    </div>
  );
}
