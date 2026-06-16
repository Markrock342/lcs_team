import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isDispatchAuthorized,
  processChatMessageNotifications,
} from "@/lib/notification-chat";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const messageId = body.messageId as string | undefined;
  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  const fromDispatch = isDispatchAuthorized(request);
  let db = supabase;

  if (fromDispatch) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Service role not configured" },
        { status: 500 }
      );
    }
    db = admin;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: msg } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg || msg.sender_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await processChatMessageNotifications(db, messageId);
  return NextResponse.json({ ok: true, ...result });
}
