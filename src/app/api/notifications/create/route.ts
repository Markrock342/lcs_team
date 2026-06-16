import { createClient } from "@/lib/supabase/server";
import { deliverNotifications } from "@/lib/notification-server";
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

  await deliverNotifications(supabase, [
    { userId, title, body: body ?? "", link },
  ]);

  return NextResponse.json({ ok: true });
}
