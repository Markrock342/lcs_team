import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push-server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const in3days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, assigned_to")
    .neq("status", "done")
    .not("due_date", "is", null)
    .lte("due_date", in3days);

  let sent = 0;

  for (const task of tasks ?? []) {
    if (!task.assigned_to) continue;
    const isOverdue = task.due_date! < today;
    const isDueSoon = task.due_date! <= in3days && !isOverdue;

    if (!isOverdue && !isDueSoon) continue;

    const title = isOverdue ? "⚠️ งานเลยกำหนด" : "📅 งานใกล้ครบ";
    const body = `${task.title} — ครบ ${task.due_date}`;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", task.assigned_to)
      .eq("body", body)
      .gte("created_at", new Date(Date.now() - 86400000).toISOString())
      .limit(1);

    if (existing?.length) continue;

    await supabase.from("notifications").insert({
      user_id: task.assigned_to,
      title,
      body,
      link: "/tasks",
    });

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", task.assigned_to);

    if (subs?.length) {
      await sendPushToUser(subs, { title, body, link: "/tasks" });
    }
    sent++;
  }

  return NextResponse.json({ checked: tasks?.length ?? 0, sent });
}
