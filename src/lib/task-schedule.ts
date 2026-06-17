import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import { th } from "date-fns/locale";

export type CountdownTone =
  | "muted"
  | "waiting"
  | "active"
  | "urgent"
  | "overdue"
  | "done";

export type TaskCountdownInfo = {
  label: string;
  detail?: string;
  tone: CountdownTone;
};

export const COUNTDOWN_TONE_CLASS: Record<CountdownTone, string> = {
  muted: "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
  waiting: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  urgent: "bg-amber-500/20 text-amber-200 border-amber-500/35",
  overdue: "bg-red-500/15 text-red-300 border-red-500/30",
  done: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
};

export function formatTaskDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy", { locale: th });
  } catch {
    return iso;
  }
}

export function addDaysISO(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), "yyyy-MM-dd");
}

export function daysBetweenInclusive(start: string, end: string): number {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
}

export function dueDateFromStart(start: string, durationDays: number): string {
  return addDaysISO(start, Math.max(durationDays, 1) - 1);
}

export function getTaskCountdown(task: {
  start_date?: string | null;
  due_date?: string | null;
  status?: string;
}): TaskCountdownInfo {
  if (task.status === "done") {
    return { label: "เสร็จแล้ว", tone: "done" };
  }

  if (!task.start_date && !task.due_date) {
    return { label: "ยังไม่กำหนดวัน", tone: "muted" };
  }

  const today = startOfDay(new Date());
  const start = task.start_date ? startOfDay(parseISO(task.start_date)) : null;
  const due = task.due_date ? startOfDay(parseISO(task.due_date)) : null;

  if (start && today < start) {
    const days = differenceInCalendarDays(start, today);
    return {
      label: `เริ่มใน ${days} วัน`,
      detail: formatTaskDate(task.start_date),
      tone: "waiting",
    };
  }

  if (due) {
    const daysLeft = differenceInCalendarDays(due, today);
    if (daysLeft < 0) {
      return {
        label: `เลยกำหนด ${Math.abs(daysLeft)} วัน`,
        detail: `ครบ ${formatTaskDate(task.due_date)}`,
        tone: "overdue",
      };
    }
    if (daysLeft === 0) {
      return {
        label: "ครบกำหนดวันนี้",
        detail: formatTaskDate(task.due_date),
        tone: "urgent",
      };
    }
    return {
      label: `เหลือ ${daysLeft} วัน`,
      detail: `ครบ ${formatTaskDate(task.due_date)}`,
      tone: daysLeft <= 3 ? "urgent" : "active",
    };
  }

  if (start) {
    return {
      label: "เริ่มงานแล้ว",
      detail: formatTaskDate(task.start_date),
      tone: "active",
    };
  }

  return { label: "ยังไม่กำหนดวัน", tone: "muted" };
}

/** ถ้าถึงวันเริ่มแล้วและยัง pending → ควรเป็น in_progress */
export function suggestedStatusOnSave(
  startDate: string | null | undefined,
  currentStatus: string
): string {
  if (!startDate || currentStatus === "done") return currentStatus;
  const today = format(new Date(), "yyyy-MM-dd");
  if (startDate <= today && currentStatus === "pending") {
    return "in_progress";
  }
  return currentStatus;
}
