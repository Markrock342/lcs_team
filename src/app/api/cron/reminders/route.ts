import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deliverNotifications } from "@/lib/notification-server";
import { buildTaskDeadlineNotifications } from "@/lib/task-deadline-reminders";
import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { NextResponse } from "next/server";

function isAuthorized(request: Request): boolean {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.NOTIFICATION_DISPATCH_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;
  return false;
}

export async function GET(request: Request) {
  const cronAuth = isAuthorized(request);
  const admin = createAdminClient();

  if (!cronAuth) {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = admin;
  if (!db) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY required for reminders" },
      { status: 500 }
    );
  }

  const today = startOfDay(new Date());
  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, title, due_date, assigned_to, created_by, status, updated_at")
    .neq("status", "done")
    .not("due_date", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notifications = buildTaskDeadlineNotifications(tasks ?? []);

  const { data: invoices } = await db
    .from("invoices")
    .select("id, title, due_date, status, created_by, client_id")
    .in("status", ["sent", "partial", "overdue"]);

  for (const invoice of invoices ?? []) {
    if (!invoice.due_date || !invoice.created_by) continue;
    const days = differenceInCalendarDays(startOfDay(parseISO(invoice.due_date)), today);
    if (days > 3) continue;
    notifications.push({
      userId: invoice.created_by,
      title: days < 0 ? "ใบแจ้งหนี้เลยกำหนด" : "ใบแจ้งหนี้ใกล้ครบ",
      body: invoice.title,
      link: "/invoices",
      sourceType: days < 0 ? "invoice_overdue" : "invoice_due",
      sourceId: `${invoice.id}:${today.toISOString().slice(0, 10)}`,
      kind: "invoice",
    });
  }

  const { data: prospects } = await db
    .from("sales_prospects")
    .select("id, name, owner_id, updated_at, status, next_follow_up")
    .in("status", ["new", "assigned", "contacted", "interested"]);

  for (const prospect of prospects ?? []) {
    if (!prospect.owner_id || !prospect.updated_at) continue;
    const idle = differenceInCalendarDays(today, startOfDay(parseISO(prospect.updated_at)));
    const due = prospect.next_follow_up
      ? differenceInCalendarDays(startOfDay(parseISO(prospect.next_follow_up)), today)
      : null;
    if (idle < 3 && (due == null || due > 0)) continue;
    notifications.push({
      userId: prospect.owner_id,
      title: due != null && due <= 0 ? "ถึงเวลานัดติดตาม" : "รายชื่อไม่มีความเคลื่อนไหว",
      body: prospect.name,
      link: `/sales?view=prospects&open=${prospect.id}`,
      sourceType: due != null && due <= 0 ? "prospect_followup" : "prospect_stale",
      sourceId: `${prospect.id}:${today.toISOString().slice(0, 10)}`,
      kind: "sales",
    });
  }

  const result = await deliverNotifications(db, notifications);

  return NextResponse.json({
    checked: tasks?.length ?? 0,
    candidates: notifications.length,
    inserted: result.inserted,
    pushed: result.pushed,
  });
}
