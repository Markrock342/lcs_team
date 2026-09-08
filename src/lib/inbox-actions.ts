import type { AppNotification } from "@/lib/extras-types";
import { inferNotificationKind } from "@/lib/notifications";

export type InboxAction = {
  id: string;
  label: string;
  href?: string;
  complete?: boolean;
};

export function inboxActionsFor(item: AppNotification): InboxAction[] {
  const kind = inferNotificationKind(item.title, item.link);
  const href = item.link ?? undefined;
  const actions: InboxAction[] = [];

  if (kind === "task") {
    actions.push({ id: "accept", label: "รับงาน", href: href ?? "/tasks" });
    actions.push({ id: "done", label: "ทำเครื่องหมายเสร็จ", complete: true });
  } else if (kind === "chat" || kind === "mention") {
    actions.push({ id: "reply", label: "ตอบแชท", href: href ?? "/chat" });
    actions.push({ id: "done", label: "เก็บเข้าแล้ว", complete: true });
  } else if (kind === "sales") {
    actions.push({ id: "follow", label: "ติดตามต่อ", href: href ?? "/sales?view=today" });
    actions.push({ id: "snooze", label: "เลื่อนนัด", href: href ?? "/sales?view=today" });
    actions.push({ id: "done", label: "ทำแล้ว", complete: true });
  } else if (kind === "invoice") {
    actions.push({ id: "invoice", label: "ออกใบแจ้งหนี้", href: href ?? "/invoices" });
    actions.push({ id: "done", label: "ทำแล้ว", complete: true });
  } else {
    actions.push({ id: "open", label: "เปิดดู", href: href ?? "/today" });
    actions.push({ id: "done", label: "ทำเครื่องหมายเสร็จ", complete: true });
  }

  return actions;
}
