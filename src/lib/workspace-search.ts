import type { SupabaseClient } from "@supabase/supabase-js";
import { chatMessageHref, formatChannelDisplay } from "./channels";

export type WorkspaceSearchHit = {
  type: "task" | "client" | "message" | "invoice" | "prospect" | "deal";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function searchWorkspace(
  supabase: SupabaseClient,
  q: string,
  opts?: { includeFinance?: boolean }
): Promise<WorkspaceSearchHit[]> {
  const pattern = `%${q}%`;
  const includeFinance = opts?.includeFinance ?? true;

  const [tasksRes, clientsRes, messagesRes, invoicesRes, prospectsRes, dealsRes] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, client:clients(name)")
        .ilike("title", pattern)
        .limit(6),
      supabase
        .from("clients")
        .select("id, name, company")
        .ilike("name", pattern)
        .limit(6),
      supabase
        .from("messages")
        .select("id, content, channel_id, channels(name, kind)")
        .is("deleted_at", null)
        .ilike("content", pattern)
        .limit(6),
      includeFinance
        ? supabase
            .from("invoices")
            .select("id, title, client:clients(name)")
            .ilike("title", pattern)
            .limit(4)
        : Promise.resolve({ data: [] as { id: string; title: string; client?: unknown }[] }),
      supabase
        .from("sales_prospects")
        .select("id, name, contact_phone")
        .ilike("name", pattern)
        .limit(6),
      supabase
        .from("sales_deals")
        .select("id, title, company")
        .ilike("title", pattern)
        .limit(4),
    ]);

  const items: WorkspaceSearchHit[] = [];

  for (const row of tasksRes.data ?? []) {
    const client = asOne(row.client as { name: string } | { name: string }[] | null);
    items.push({
      type: "task",
      id: row.id,
      title: row.title,
      subtitle: client?.name ?? "งาน",
      href: `/tasks?open=${row.id}`,
    });
  }

  for (const row of clientsRes.data ?? []) {
    items.push({
      type: "client",
      id: row.id,
      title: row.name,
      subtitle: row.company ?? "ลูกค้า",
      href: `/clients/${row.id}`,
    });
  }

  for (const row of messagesRes.data ?? []) {
    const raw = row as {
      id: string;
      content: string | null;
      channel_id: string;
      channels?: { name: string } | { name: string }[] | null;
    };
    const channel = asOne(raw.channels);
    items.push({
      type: "message",
      id: raw.id,
      title: (raw.content ?? "").slice(0, 80) || "ไฟล์แนบ",
      subtitle: formatChannelDisplay(channel?.name ?? "chat"),
      href: chatMessageHref(raw.channel_id, raw.id),
    });
  }

  for (const row of invoicesRes.data ?? []) {
    const raw = row as {
      id: string;
      title: string;
      client?: { name: string } | { name: string }[] | null;
    };
    const client = asOne(raw.client);
    items.push({
      type: "invoice",
      id: raw.id,
      title: raw.title,
      subtitle: client?.name ?? "เอกสาร",
      href: "/invoices",
    });
  }

  for (const row of prospectsRes.data ?? []) {
    items.push({
      type: "prospect",
      id: row.id,
      title: row.name,
      subtitle: row.contact_phone ?? "เป้าหมาย",
      href: `/sales?view=prospects&open=${row.id}`,
    });
  }

  for (const row of dealsRes.data ?? []) {
    items.push({
      type: "deal",
      id: row.id,
      title: row.title,
      subtitle: row.company ?? "ดีล",
      href: `/sales?view=pipeline&open=${row.id}`,
    });
  }

  return items;
}
