import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push-server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

  const { userId, title, body, link } = await request.json();
  if (!userId || !title) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    title,
    body,
    link: link ?? null,
  });

  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  const { data: profile } = await db
    .from("profiles")
    .select("push_enabled")
    .eq("id", userId)
    .single();

  if (profile?.push_enabled !== false && subs?.length) {
    await sendPushToUser(subs, { title, body, link });
  }

  return NextResponse.json({ ok: true });
}
