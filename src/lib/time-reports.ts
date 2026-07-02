import type { TimeEntry } from "./extras-types";
import type { Profile } from "./types";

export type TimeReportRow = {
  userId: string;
  userName: string;
  totalMinutes: number;
  entryCount: number;
};

export type TimeReportByClient = {
  clientId: string;
  clientName: string;
  totalMinutes: number;
};

export function sumTimeEntries(entries: TimeEntry[]) {
  return entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  return `${h} ชม. ${m} นาที`;
}

export function aggregateByUser(
  entries: (TimeEntry & { user?: Profile | null })[],
  profiles: Profile[]
): TimeReportRow[] {
  const map = new Map<string, TimeReportRow>();

  for (const e of entries) {
    const userId = e.user_id;
    const existing = map.get(userId) ?? {
      userId,
      userName:
        e.user?.display_name ??
        profiles.find((p) => p.id === userId)?.display_name ??
        "ทีม",
      totalMinutes: 0,
      entryCount: 0,
    };
    existing.totalMinutes += e.duration_minutes ?? 0;
    existing.entryCount += 1;
    map.set(userId, existing);
  }

  return [...map.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export function aggregateByClient(
  entries: TimeEntry[],
  tasks: Array<{ id: string; client_id: string | null; client?: { name: string } | null }>
): TimeReportByClient[] {
  const taskClient = new Map(
    tasks.map((t) => [t.id, { id: t.client_id, name: t.client?.name }])
  );
  const map = new Map<string, TimeReportByClient>();

  for (const e of entries) {
    const client = taskClient.get(e.task_id);
    const clientId = client?.id ?? "none";
    const clientName = client?.name ?? "ไม่ระบุลูกค้า";
    const existing = map.get(clientId) ?? {
      clientId,
      clientName,
      totalMinutes: 0,
    };
    existing.totalMinutes += e.duration_minutes ?? 0;
    map.set(clientId, existing);
  }

  return [...map.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export function filterEntriesByPeriod(entries: TimeEntry[], period: string) {
  if (period === "all") return entries;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return entries.filter((e) => {
    const d = new Date(e.started_at);
    if (period === "month") {
      return d.getFullYear() === y && d.getMonth() === m;
    }
    if (period === "year") {
      return d.getFullYear() === y;
    }
    return true;
  });
}
