import type { SupabaseClient } from "@supabase/supabase-js";
import { neonRequest } from "@/lib/neon/client";

export const SLASH_COMMANDS = [
  { cmd: "/งาน", hint: "สร้างงาน เช่น /งาน แก้บั๊กล็อกอิน" },
  { cmd: "/ลูกค้า", hint: "เพิ่มลูกค้า เช่น /ลูกค้า ร้านกาแฟบ้านป่า" },
  { cmd: "/ดีล", hint: "เปิดดีลขาย เช่น /ดีล เว็บร้านค้า" },
  { cmd: "/help", hint: "ดูคำสั่งที่ใช้ได้" },
] as const;

export type SlashResult =
  | { kind: "help"; text: string }
  | { kind: "ok"; content: string; linkedTaskId?: string; href: string }
  | { kind: "error"; text: string }
  | null;

function parseSlash(raw: string) {
  const text = raw.trim();
  if (!text.startsWith("/")) return null;
  const [cmd, ...rest] = text.split(/\s+/);
  return { cmd: cmd.toLowerCase(), title: rest.join(" ").trim(), original: cmd };
}

export function slashSuggestions(value: string) {
  const q = value.trim().toLowerCase();
  if (!q.startsWith("/")) return [];
  return SLASH_COMMANDS.filter((item) => item.cmd.startsWith(q) || q === "/");
}

export async function runSlashCommand(
  supabase: SupabaseClient,
  raw: string,
  userId: string
): Promise<SlashResult> {
  const parsed = parseSlash(raw);
  if (!parsed) return null;

  const cmd = parsed.original;
  const key = parsed.cmd.replace(/^\//, "");

  if (key === "help" || cmd === "/help") {
    return {
      kind: "help",
      text: SLASH_COMMANDS.map((item) => `${item.cmd} — ${item.hint}`).join("\n"),
    };
  }

  if (!parsed.title) {
    return { kind: "error", text: "พิมพ์ชื่อต่อท้ายคำสั่ง เช่น /งาน แก้บั๊กล็อกอิน" };
  }

  if (cmd === "/งาน" || key === "task") {
    try {
      const { task: data } = await neonRequest<{ task: { id: string; title: string } }>("/api/neon/tasks", {
        method: "POST",
        body: JSON.stringify({
        title: parsed.title,
        status: "pending",
        priority: "medium",
        duration_days: 1,
        progress: 0,
        }),
      });
      return {
        kind: "ok",
        content: `สร้างงาน «${data.title}»`,
        linkedTaskId: data.id,
        href: `/tasks?open=${data.id}`,
      };
    } catch (error) {
      return { kind: "error", text: error instanceof Error ? error.message : "สร้างงานไม่สำเร็จ" };
    }
  }

  if (cmd === "/ลูกค้า" || key === "client") {
    try {
      const { client: data } = await neonRequest<{ client: { id: string; name: string } }>("/api/neon/clients", {
        method: "POST",
        body: JSON.stringify({
        name: parsed.title,
        status: "lead",
        project_type: "other",
        }),
      });
      return {
        kind: "ok",
        content: `เพิ่มลูกค้า «${data.name}»`,
        href: `/clients/${data.id}`,
      };
    } catch (error) {
      return { kind: "error", text: error instanceof Error ? error.message : "เพิ่มลูกค้าไม่สำเร็จ" };
    }
  }

  if (cmd === "/ดีล" || key === "deal") {
    try {
      const { row: data } = await neonRequest<{ row: { id: string; title: string } }>("/api/neon/sales", {
        method: "POST",
        body: JSON.stringify({ resource: "deal", data: {
        title: parsed.title,
        stage: "lead",
        owner_id: userId,
        } }),
      });
      return {
        kind: "ok",
        content: `เปิดดีล «${data.title}»`,
        href: `/sales?view=pipeline&open=${data.id}`,
      };
    } catch (error) {
      return { kind: "error", text: error instanceof Error ? error.message : "เปิดดีลไม่สำเร็จ" };
    }
  }

  return null;
}
