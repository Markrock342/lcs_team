import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type { NotificationPayload } from "@/lib/notification-server";
import { formatTaskDate } from "@/lib/task-schedule";

export type DeadlineReminderKind =
  | "task_deadline_3d"
  | "task_deadline_1d"
  | "task_deadline_today"
  | "task_overdue";

export type TaskDeadlineRow = {
  id: string;
  title: string;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  status: string;
};

const REMINDER_COPY: Record<
  DeadlineReminderKind,
  { title: string; bodyPrefix: string }
> = {
  task_deadline_3d: {
    title: "📅 งานใกล้ครบกำหนด",
    bodyPrefix: "อีก 3 วัน",
  },
  task_deadline_1d: {
    title: "⏰ งานครบพรุ่งนี้",
    bodyPrefix: "อีก 1 วัน",
  },
  task_deadline_today: {
    title: "🔔 งานครบวันนี้",
    bodyPrefix: "ครบกำหนดวันนี้",
  },
  task_overdue: {
    title: "⚠️ งานเลยกำหนด",
    bodyPrefix: "เลยกำหนดแล้ว",
  },
};

export function getDeadlineReminderKind(
  dueDate: string,
  today = new Date()
): DeadlineReminderKind | null {
  const daysLeft = differenceInCalendarDays(
    startOfDay(parseISO(dueDate)),
    startOfDay(today)
  );

  if (daysLeft === 3) return "task_deadline_3d";
  if (daysLeft === 1) return "task_deadline_1d";
  if (daysLeft === 0) return "task_deadline_today";
  if (daysLeft < 0) return "task_overdue";
  return null;
}

export function buildTaskDeadlineNotifications(
  tasks: TaskDeadlineRow[],
  today = new Date()
): NotificationPayload[] {
  const items: NotificationPayload[] = [];

  for (const task of tasks) {
    if (!task.due_date || task.status === "done") continue;

    const reminderKind = getDeadlineReminderKind(task.due_date, today);
    if (!reminderKind) continue;

    const recipients = new Set<string>();
    if (task.assigned_to) recipients.add(task.assigned_to);
    else if (task.created_by) recipients.add(task.created_by);
    if (!recipients.size) continue;

    const copy = REMINDER_COPY[reminderKind];
    const dateLabel = formatTaskDate(task.due_date);
    const body = `${task.title} — ${copy.bodyPrefix} (ครบ ${dateLabel})`;

    for (const userId of recipients) {
      items.push({
        userId,
        title: copy.title,
        body,
        link: "/tasks",
        sourceType: reminderKind,
        sourceId: task.id,
        kind: "task",
      });
    }
  }

  return items;
}
