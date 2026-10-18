import { createClient } from "@/lib/supabase/server";
import {
  isDispatchAuthorized,
  processChatMessageNotifications,
} from "@/lib/notification-chat";
import { NextResponse } from "next/server";
import { queryNeon } from "@/lib/neon/server";

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
  if (!fromDispatch) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rows } = await queryNeon<{ sender_id: string }>(
      `SELECT sender_id FROM public.messages WHERE id = $1 LIMIT 1`, [messageId]
    );
    const msg = rows[0];

    if (!msg || msg.sender_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await processChatMessageNotifications(messageId);
  return NextResponse.json({ ok: true, ...result });
}
