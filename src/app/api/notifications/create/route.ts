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
  const { userId, title, body: msgBody, link, sourceType, sourceId, kind } =
    body;

  if (!userId || !title) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await deliverNotifications(supabase, [
    {
      userId,
      title,
      body: msgBody ?? "",
      link,
      sourceType,
      sourceId,
      kind,
    },
  ]);

  return NextResponse.json({ ok: true, ...result });
}
