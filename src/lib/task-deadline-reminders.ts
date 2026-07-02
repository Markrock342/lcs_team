import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type { NotificationPayload } from "@/lib/notification-server";
import { formatTaskDate } from "@/lib/task-schedule";

export type DeadlineReminderKind =
  | "task_deadline_7d"
  | "task_deadline_3d"
  | "task_deadline_2d"
  | "task_deadline_1d"
  | "task_deadline_today"
  | "task_overdue"
  | "task_stalled";

export type TaskDeadlineRow = {
  id: string;
  title: string;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  status: string;
  updated_at?: string | null;
};

const REMINDER_COPY: Record<
  DeadlineReminderKind,
  { title: string; bodyPrefix: string }
> = {
  task_deadline_7d: {
    title: "📅 งานใกล้ครบกำหนด",
    bodyPrefix: "อีก 7 วัน",
  },
  task_deadline_3d: {
    title: "📅 งานใกล้ครบกำหนด",
    bodyPrefix: "อีก 3 วัน",
  },
  task_deadline_2d: {
    title: "📅 งานใกล้ครบกำหนด",
    bodyPrefix: "อีก 2 วัน",
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
  task_stalled: {
    title: "💤 งานค้างนาน",
    bodyPrefix: "ไม่มีการอัปเดตมา 7 วัน",
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

  if (daysLeft === 7) return "task_deadline_7d";
  if (daysLeft === 3) return "task_deadline_3d";
  if (daysLeft === 2) return "task_deadline_2d";
  if (daysLeft === 1) return "task_deadline_1d";
  if (daysLeft === 0) return "task_deadline_today";
  if (daysLeft < 0) return "task_overdue";
  return null;
}

export function getStalledReminderKind(
  task: TaskDeadlineRow,
  today = new Date()
): "task_stalled" | null {
  if (task.status !== "in_progress" || !task.updated_at) return null;
  const daysSince = differenceInCalendarDays(
    startOfDay(today),
    startOfDay(parseISO(task.updated_at))
  );
  if (daysSince >= 7) return "task_stalled";
  return null;
}

function recipientsForTask(task: TaskDeadlineRow): Set<string> {
  const recipients = new Set<string>();
  if (task.assigned_to) recipients.add(task.assigned_to);
  else if (task.created_by) recipients.add(task.created_by);
  return recipients;
}

function pushReminder(
  items: NotificationPayload[],
  task: TaskDeadlineRow,
  kind: DeadlineReminderKind,
  bodyExtra?: string
) {
  const recipients = recipientsForTask(task);
  if (!recipients.size) return;

  const copy = REMINDER_COPY[kind];
  const dateLabel = task.due_date ? formatTaskDate(task.due_date) : "";
  const body = bodyExtra
    ? `${task.title} — ${bodyExtra}`
    : task.due_date
      ? `${task.title} — ${copy.bodyPrefix} (ครบ ${dateLabel})`
      : `${task.title} — ${copy.bodyPrefix}`;

  for (const userId of recipients) {
    items.push({
      userId,
      title: copy.title,
      body,
      link: "/tasks",
      sourceType: kind,
      sourceId: task.id,
      kind: "task",
    });
  }
}

export function buildTaskDeadlineNotifications(
  tasks: TaskDeadlineRow[],
  today = new Date()
): NotificationPayload[] {
  const items: NotificationPayload[] = [];

  for (const task of tasks) {
    if (task.status === "done") continue;

    if (task.due_date) {
      const reminderKind = getDeadlineReminderKind(task.due_date, today);
      if (reminderKind) {
        pushReminder(items, task, reminderKind);
      }
    }

    const stalled = getStalledReminderKind(task, today);
    if (stalled) {
      pushReminder(items, task, stalled);
    }
  }

  return items;
}
