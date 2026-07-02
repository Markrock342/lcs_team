import type { ClientTimelineItem } from "./extras-types";
import type { ActivityLog, ClientFile, Invoice } from "./extras-types";
import type { Task } from "./types";
import { ACTIVITY_ACTION_LABELS } from "./extras-types";

export function buildClientTimeline(input: {
  activities: ActivityLog[];
  tasks: Task[];
  invoices: Invoice[];
  files: ClientFile[];
  portalComments?: { author_name: string; content: string; created_at: string }[];
}): ClientTimelineItem[] {
  const items: ClientTimelineItem[] = [];

  for (const a of input.activities) {
    items.push({
      id: `act-${a.id}`,
      type: "activity",
      title: `${ACTIVITY_ACTION_LABELS[a.action] ?? a.action} ${a.entity_title ?? ""}`.trim(),
      subtitle: a.user?.display_name ?? undefined,
      date: a.created_at,
      link: a.entity_type === "task" ? "/tasks" : undefined,
    });
  }

  for (const t of input.tasks) {
    items.push({
      id: `task-${t.id}`,
      type: "task",
      title: t.title,
      subtitle: t.status,
      date: t.updated_at ?? t.created_at,
      link: "/tasks",
    });
  }

  for (const inv of input.invoices) {
    items.push({
      id: `inv-${inv.id}`,
      type: "invoice",
      title: inv.title,
      subtitle: `฿${inv.total_amount.toLocaleString()} · ${inv.status}`,
      date: inv.updated_at ?? inv.created_at,
      link: "/invoices",
    });
  }

  for (const f of input.files) {
    items.push({
      id: `file-${f.id}`,
      type: "file",
      title: f.name,
      subtitle: "ไฟล์แนบ",
      date: f.created_at,
    });
  }

  for (const c of input.portalComments ?? []) {
    items.push({
      id: `portal-${c.created_at}-${c.author_name}`,
      type: "portal",
      title: `${c.author_name}: ${c.content.slice(0, 60)}`,
      subtitle: "ความเห็นจาก Portal",
      date: c.created_at,
    });
  }

  return items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
