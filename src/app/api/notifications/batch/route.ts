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

  const body = await request.json();
  const notifications = body.notifications as
    | {
        userId: string;
        title: string;
        body: string;
        link?: string;
      }[]
    | undefined;

  if (!Array.isArray(notifications) || notifications.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (notifications.length > 50) {
    return NextResponse.json({ error: "Too many notifications" }, { status: 400 });
  }

  const valid = notifications.filter((n) => n.userId && n.title);
  if (!valid.length) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await deliverNotifications(supabase, valid);
  return NextResponse.json({ ok: true, sent: valid.length });
}
