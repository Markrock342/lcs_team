import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deliverNotifications } from "@/lib/notification-server";
import { buildTaskDeadlineNotifications } from "@/lib/task-deadline-reminders";
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

  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, title, due_date, assigned_to, created_by, status")
    .neq("status", "done")
    .not("due_date", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notifications = buildTaskDeadlineNotifications(tasks ?? []);
  const result = await deliverNotifications(db, notifications);

  return NextResponse.json({
    checked: tasks?.length ?? 0,
    candidates: notifications.length,
    inserted: result.inserted,
    pushed: result.pushed,
  });
}
