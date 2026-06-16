import { createClient } from "@/lib/supabase/client";

export async function logActivity(
  action: string,
  entityType: string,
  entityId: string | null,
  entityTitle: string,
  details?: Record<string, unknown>
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("activity_logs").insert({
      user_id: user?.id ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_title: entityTitle,
      details: details ?? null,
    });
  } catch {
    // table may not exist yet
  }
}

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  link?: string
) {
  try {
    await fetch("/api/notifications/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, body, link }),
    });
  } catch {
    // ignore
  }
}

export async function notifyTeam(
  excludeUserId: string | null,
  title: string,
  body: string,
  link?: string
) {
  try {
    const supabase = createClient();
    const { data: profiles } = await supabase.from("profiles").select("id");
    for (const p of profiles ?? []) {
      if (p.id !== excludeUserId) {
        await notifyUser(p.id, title, body, link);
      }
    }
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
