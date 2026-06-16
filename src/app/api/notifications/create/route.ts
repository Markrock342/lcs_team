import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push-server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, title, body, link } = await request.json();

  // Insert in-app notification
  await supabase.from("notifications").insert({
    user_id: userId,
    title,
    body,
    link: link ?? null,
  });

  // Send push
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  const { data: profile } = await supabase
    .from("profiles")
    .select("push_enabled")
    .eq("id", userId)
    .single();

  if (profile?.push_enabled !== false && subs?.length) {
    await sendPushToUser(subs, { title, body, link });
  }

  return NextResponse.json({ ok: true });
}
