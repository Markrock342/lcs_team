import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
import type { AppNotification } from "@/lib/extras-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: unknown) {
  console.error("[neon/notifications]", error);
  return NextResponse.json({ error: "จัดการการแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const rawLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
    const [{ rows }, unread] = await Promise.all([
      queryNeon<AppNotification>(
      `SELECT n.*, (n.silent OR EXISTS (
         SELECT 1 FROM public.messages m JOIN public.chat_notification_preferences cp ON cp.channel_id=m.channel_id
         WHERE n.source_type='message' AND m.id=n.source_id AND cp.user_id=n.user_id
           AND (cp.mute_forever OR cp.muted_until > NOW())
       )) AS muted
       FROM public.notifications n
       WHERE n.user_id = $1 ${unreadOnly ? "AND n.read = FALSE" : ""}
       ORDER BY n.created_at DESC LIMIT $2`,
      [auth.context.userId, limit],
      ),
      queryNeon<{ count: number }>(
        `SELECT count(*)::int AS count FROM public.notifications WHERE user_id=$1 AND read=FALSE`,
        [auth.context.userId],
      ),
    ]);
    return NextResponse.json({ notifications: rows, unreadCount: unread.rows[0]?.count ?? 0 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown; all?: unknown; channelId?: unknown; link?: unknown; read?: unknown; done?: unknown };
    const read = body.read !== false;
    if (body.all === true) {
      await queryNeon(
        `UPDATE public.notifications SET read = $1 WHERE user_id = $2`,
        [read, auth.context.userId],
      );
      return NextResponse.json({ ok: true });
    }
    if (body.channelId !== undefined) {
      if (typeof body.channelId !== "string" || !UUID_RE.test(body.channelId)) {
        return NextResponse.json({ error: "รหัสช่องไม่ถูกต้อง" }, { status: 400 });
      }
      await queryNeon(
        `UPDATE public.notifications n SET read=$1
         WHERE n.user_id=$2 AND n.read=FALSE AND (
           (n.source_type='message' AND n.source_id IN (SELECT id FROM public.messages WHERE channel_id=$3))
           OR n.link=$4 OR n.link LIKE $5
         )`,
        [read, auth.context.userId, body.channelId,
          `/chat?channel=${body.channelId}`, `/chat?channel=${body.channelId}&%`],
      );
      return NextResponse.json({ ok: true });
    }
    if (typeof body.link === "string" && body.link.startsWith("/")) {
      await queryNeon(
        `UPDATE public.notifications SET read=$1 WHERE user_id=$2 AND link=$3 AND read=FALSE`,
        [read, auth.context.userId, body.link],
      );
      return NextResponse.json({ ok: true });
    }
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "รหัสการแจ้งเตือนไม่ถูกต้อง" }, { status: 400 });
    }
    const { rows } = await queryNeon<AppNotification>(
      `UPDATE public.notifications
       SET read = $1, done_at = CASE WHEN $2::boolean THEN NOW() ELSE done_at END
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [read, body.done === true, body.id, auth.context.userId],
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบการแจ้งเตือน" }, { status: 404 });
    return NextResponse.json({ notification: rows[0] });
  } catch (error) {
    return fail(error);
  }
}
