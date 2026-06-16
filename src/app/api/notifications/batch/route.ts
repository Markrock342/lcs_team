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
        sourceType?: string;
        sourceId?: string;
        kind?: "chat" | "mention" | "task" | "system";
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

  const result = await deliverNotifications(
    supabase,
    valid.map((n) => ({
      userId: n.userId,
      title: n.title,
      body: n.body ?? "",
      link: n.link,
      sourceType: n.sourceType,
      sourceId: n.sourceId,
      kind: n.kind,
    }))
  );

  return NextResponse.json({ ok: true, ...result });
}
