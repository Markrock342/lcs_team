import type { SupabaseClient } from "@supabase/supabase-js";
import { chatMessageHref, formatChannelDisplay } from "./channels";
import { neonRequest } from "./neon/client";
import type { Client, SalesDeal, SalesProspect, Task } from "./types";
import type { Invoice } from "./extras-types";

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
  const includeFinance = opts?.includeFinance ?? true;

  const [taskData, clientData, messagesRes, invoiceData, salesData] =
    await Promise.all([
      neonRequest<{ tasks: Task[] }>("/api/neon/tasks", { cache: "no-store" }),
      neonRequest<{ clients: Client[] }>("/api/neon/clients", { cache: "no-store" }),
      neonRequest<{ messages: Array<{ id: string; content: string | null; channel_id: string; channels: { name: string; kind?: string | null } }> }>(
        `/api/neon/chat?mode=search&q=${encodeURIComponent(q)}`, { cache: "no-store" }
      ),
      includeFinance
        ? neonRequest<{ invoices: Invoice[] }>("/api/neon/invoices", { cache: "no-store" })
        : Promise.resolve({ invoices: [] as Invoice[] }),
      neonRequest<{ prospects: SalesProspect[]; deals: SalesDeal[] }>("/api/neon/sales", { cache: "no-store" }),
    ]);

  const items: WorkspaceSearchHit[] = [];

  const query = q.trim().toLocaleLowerCase("th");
  for (const row of taskData.tasks.filter((item) => item.title.toLocaleLowerCase("th").includes(query)).slice(0, 6)) {
    const client = row.client;
    items.push({
      type: "task",
      id: row.id,
      title: row.title,
      subtitle: client?.name ?? "งาน",
      href: `/tasks?open=${row.id}`,
    });
  }

  for (const row of clientData.clients.filter((item) => item.name.toLocaleLowerCase("th").includes(query)).slice(0, 6)) {
    items.push({
      type: "client",
      id: row.id,
      title: row.name,
      subtitle: row.company ?? "ลูกค้า",
      href: `/clients/${row.id}`,
    });
  }

  for (const row of messagesRes.messages ?? []) {
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

  for (const raw of invoiceData.invoices.filter((item) => item.title.toLocaleLowerCase("th").includes(query)).slice(0, 4)) {
    const client = raw.client;
    items.push({
      type: "invoice",
      id: raw.id,
      title: raw.title,
      subtitle: client?.name ?? "เอกสาร",
      href: "/invoices",
    });
  }

  for (const row of salesData.prospects.filter((item) => item.name.toLocaleLowerCase("th").includes(query)).slice(0, 6)) {
    items.push({
      type: "prospect",
      id: row.id,
      title: row.name,
      subtitle: row.contact_phone ?? "เป้าหมาย",
      href: `/sales?view=prospects&open=${row.id}`,
    });
  }

  for (const row of salesData.deals.filter((item) => item.title.toLocaleLowerCase("th").includes(query)).slice(0, 4)) {
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
