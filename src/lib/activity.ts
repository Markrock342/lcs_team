import { neonRequest } from "@/lib/neon/client";
import {
  sendNotification,
  sendNotifications,
} from "@/lib/notifications";

export async function logActivity(
  action: string,
  entityType: string,
  entityId: string | null,
  entityTitle: string,
  details?: Record<string, unknown>
) {
  try {
    await neonRequest("/api/neon/activity", {
      method: "POST",
      body: JSON.stringify({
        action,
        entityType,
        entityId,
        entityTitle,
        details: details ?? null,
      }),
    });
  } catch {
    // Activity logging must not block the user's primary action.
  }
}

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  link?: string
) {
  await sendNotification({ userId, title, body, link });
}

export async function notifyTeam(
  excludeUserId: string | null,
  title: string,
  body: string,
  link?: string
) {
  try {
    const { profiles } = await neonRequest<{ profiles: Array<{ id: string }> }>(
      "/api/neon/profiles",
      { cache: "no-store" },
    );
    const items = profiles
      .filter((profile) => profile.id !== excludeUserId)
      .map((profile) => ({ userId: profile.id, title, body, link }));
    await sendNotifications(items);
  } catch {
    // ignore
  }
}

export function parseMentions(text: string, profiles: { id: string; username: string }[]): string[] {
  const ids: string[] = [];
  const regex = /@(\w+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const user = profiles.find(
      (p) => p.username.toLowerCase() === match![1].toLowerCase()
    );
    if (user && !ids.includes(user.id)) ids.push(user.id);
  }
  return ids;
}

export function exportToCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = "\uFEFF";
  const csv =
    bom +
    [headers.join(","), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
