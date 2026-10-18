import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueueRow = {
  tasks: Array<{ id: string; title: string; status: string; due_date: string }>;
  deals: Array<{ id: string; title: string; next_follow_up: string }>;
  prospects: Array<{ id: string; name: string; next_follow_up: string }>;
  invoices: Array<{ id: string; title: string; status: string; due_date: string }>;
  notifications: Array<{ id: string; title: string; body: string | null; link: string | null }>;
  channels: Array<{ id: string; name: string; kind: string | null; dm_name: string | null; unread_count: number }>;
};

type DayItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "blue" | "amber" | "red" | "violet" | "slate";
};

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "ยังไม่เริ่ม",
  waiting: "รอดำเนินการ",
  in_progress: "กำลังทำ",
  review: "รอตรวจ",
  done: "เสร็จแล้ว",
};

function isoDate(value: string | Date) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const userId = auth.context.userId;

    const { rows } = await queryNeon<QueueRow>(`
      SELECT
        COALESCE((
          SELECT jsonb_agg(to_jsonb(item) ORDER BY item.due_date ASC NULLS LAST)
          FROM (
            SELECT id, title, status, due_date
            FROM public.tasks
            WHERE status <> 'done'
              AND (assigned_to IS NULL OR assigned_to = $1)
              AND due_date IS NOT NULL
              AND due_date <= CURRENT_DATE + INTERVAL '3 days'
            ORDER BY due_date ASC, updated_at DESC
            LIMIT 40
          ) item
        ), '[]'::jsonb) AS tasks,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(item) ORDER BY item.next_follow_up ASC)
          FROM (
            SELECT id, title, next_follow_up
            FROM public.sales_deals
            WHERE next_follow_up IS NOT NULL
              AND next_follow_up <= CURRENT_DATE
              AND stage NOT IN ('won', 'lost')
            ORDER BY next_follow_up ASC, updated_at DESC
            LIMIT 30
          ) item
        ), '[]'::jsonb) AS deals,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(item) ORDER BY item.next_follow_up ASC)
          FROM (
            SELECT id, name, next_follow_up
            FROM public.sales_prospects
            WHERE next_follow_up IS NOT NULL
              AND next_follow_up <= CURRENT_DATE
              AND status NOT IN ('converted', 'not_interested')
            ORDER BY next_follow_up ASC, updated_at DESC
            LIMIT 30
          ) item
        ), '[]'::jsonb) AS prospects,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(item) ORDER BY item.due_date ASC)
          FROM (
            SELECT id, title, status, due_date
            FROM public.invoices
            WHERE status IN ('sent', 'partial', 'overdue')
              AND due_date IS NOT NULL
              AND due_date <= CURRENT_DATE + INTERVAL '3 days'
            ORDER BY due_date ASC, updated_at DESC
            LIMIT 30
          ) item
        ), '[]'::jsonb) AS invoices,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC)
          FROM (
            SELECT id, title, body, link, created_at
            FROM public.notifications
            WHERE user_id = $1 AND read = FALSE
            ORDER BY created_at DESC
            LIMIT 8
          ) item
        ), '[]'::jsonb) AS notifications,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at)
          FROM (
            SELECT c.id, c.name, c.kind, c.created_at,
              CASE WHEN COALESCE(c.kind, 'channel') = 'dm' THEN (
                SELECT p.display_name
                FROM public.channel_members member
                JOIN public.profiles p ON p.id = member.user_id
                WHERE member.channel_id = c.id AND member.user_id <> $1
                LIMIT 1
              ) ELSE NULL END AS dm_name,
              count(m.id)::int AS unread_count
            FROM public.channels c
            LEFT JOIN public.channel_reads cr ON cr.channel_id = c.id AND cr.user_id = $1
            LEFT JOIN public.messages m ON m.channel_id = c.id AND m.sender_id <> $1
              AND m.deleted_at IS NULL AND m.thread_id IS NULL
              AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
            WHERE COALESCE(c.kind, 'channel') <> 'dm' OR c.created_by = $1 OR EXISTS (
              SELECT 1 FROM public.channel_members access_member
              WHERE access_member.channel_id = c.id AND access_member.user_id = $1
            )
            GROUP BY c.id
            HAVING count(m.id) > 0
            ORDER BY c.created_at
            LIMIT 30
          ) item
        ), '[]'::jsonb) AS channels
    `, [userId]);

    const queue = rows[0];
    if (!queue) throw new Error("Today queue query returned no rows");
    const today = isoDate(new Date());
    const items: DayItem[] = [];

    for (const task of queue.tasks) {
      const dueDate = isoDate(task.due_date);
      items.push({
        id: `task-${task.id}`,
        title: task.title,
        detail: `${TASK_STATUS_LABELS[task.status] ?? task.status} · ครบ ${dueDate}`,
        href: "/tasks",
        action: "ทำต่องาน",
        tone: dueDate < today ? "red" : "amber",
      });
    }
    for (const deal of queue.deals) {
      items.push({ id: `deal-${deal.id}`, title: deal.title, detail: `นัดติดตามดีล ${isoDate(deal.next_follow_up)}`, href: "/sales?view=today", action: "ติดตามดีล", tone: "blue" });
    }
    for (const prospect of queue.prospects) {
      items.push({ id: `p-${prospect.id}`, title: prospect.name, detail: `นัดติดตามเป้าหมาย ${isoDate(prospect.next_follow_up)}`, href: `/sales?view=prospects&open=${prospect.id}`, action: "โทร/บันทึก", tone: "violet" });
    }
    for (const invoice of queue.invoices) {
      items.push({ id: `inv-${invoice.id}`, title: invoice.title, detail: `ใบแจ้งหนี้ครบ ${isoDate(invoice.due_date)}`, href: "/invoices", action: "ออก/ตามเงิน", tone: invoice.status === "overdue" ? "red" : "amber" });
    }
    for (const notification of queue.notifications) {
      items.push({ id: `n-${notification.id}`, title: notification.title, detail: notification.body ?? "ต้องตอบหรือจัดการ", href: notification.link ?? "/notifications", action: "จัดการ", tone: "slate" });
    }
    for (const channel of queue.channels) {
      const title = channel.kind === "dm" ? (channel.dm_name ?? "ข้อความส่วนตัว") : channel.name.replace(/^#/, "");
      items.push({ id: `chat-${channel.id}`, title, detail: `${channel.unread_count} ข้อความยังไม่อ่าน`, href: `/chat?channel=${encodeURIComponent(channel.id)}`, action: "อ่านแชท", tone: "blue" });
    }

    const urgency = { red: 0, amber: 1, violet: 2, blue: 3, slate: 4 } as const;
    items.sort((a, b) => urgency[a.tone] - urgency[b.tone]);

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "private, no-store", "Server-Timing": "today-queue;desc=single-auth-single-query" } },
    );
  } catch (error) {
    console.error("[neon/today]", error);
    return NextResponse.json({ error: "โหลดคิววันนี้ไม่สำเร็จ" }, { status: 500 });
  }
}
