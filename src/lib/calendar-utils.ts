import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
  max as maxDate,
  min as minDate,
  differenceInCalendarDays,
  format,
} from "date-fns";
import type { Task } from "@/lib/types";
import { TASK_BAR_COLORS } from "@/lib/constants";

export interface WeekRow {
  days: Date[];
}

export interface TaskSegment {
  task: Task;
  colStart: number;
  colSpan: number;
  lane: number;
  colorIndex: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface TaskWithRange {
  task: Task;
  start: Date;
  end: Date;
  lane: number;
  colorIndex: number;
}

export function getMonthWeeks(month: Date): WeekRow[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  const weeks: WeekRow[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push({ days: days.slice(i, i + 7) });
  }
  return weeks;
}

export function assignTaskLanes(tasks: Task[]): TaskWithRange[] {
  const ranged = tasks
    .filter((t) => t.start_date && t.due_date)
    .map((t) => ({
      task: t,
      start: parseISO(t.start_date!),
      end: parseISO(t.due_date!),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const laneEnds: Date[] = [];
  const result: TaskWithRange[] = [];

  for (const item of ranged) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= item.start) {
      lane++;
    }
    if (lane >= laneEnds.length) laneEnds.push(item.end);
    else laneEnds[lane] = item.end;

    result.push({
      ...item,
      lane,
      colorIndex: lane % TASK_BAR_COLORS.length,
    });
  }

  return result;
}

export function getWeekSegments(
  week: WeekRow,
  taskLanes: TaskWithRange[]
): TaskSegment[] {
  const weekStart = week.days[0];
  const weekEnd = week.days[6];
  const segments: TaskSegment[] = [];

  for (const tl of taskLanes) {
    if (tl.end < weekStart || tl.start > weekEnd) continue;

    const segStart = maxDate([tl.start, weekStart]);
    const segEnd = minDate([tl.end, weekEnd]);
    const colStart = differenceInCalendarDays(segStart, weekStart);
    const colSpan = differenceInCalendarDays(segEnd, segStart) + 1;

    segments.push({
      task: tl.task,
      colStart,
      colSpan,
      lane: tl.lane,
      colorIndex: tl.colorIndex,
      continuesBefore: tl.start < weekStart,
      continuesAfter: tl.end > weekEnd,
    });
  }

  return segments;
}

export function maxLaneCount(taskLanes: TaskWithRange[]): number {
  if (taskLanes.length === 0) return 0;
  return Math.max(...taskLanes.map((t) => t.lane)) + 1;
}

export { isSameMonth, isToday, format };
