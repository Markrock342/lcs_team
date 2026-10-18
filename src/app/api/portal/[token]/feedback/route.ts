import { deliverNotifications } from "@/lib/notification-server";
import { queryNeon } from "@/lib/neon/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json();
  const authorName = String(body.author_name ?? "").trim();
  const taskId = String(body.task_id ?? "");
  const status = String(body.status ?? "comment");
  const comment = body.comment ? String(body.comment).trim() : null;

  if (!UUID_RE.test(token) || !authorName || !UUID_RE.test(taskId) || authorName.length > 200 || (comment?.length ?? 0) > 10_000) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  if (!["approved", "changes_requested", "comment"].includes(status)) {
    return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  }

  const { rows } = await queryNeon<{ id: string; client_id: string; client_name: string }>(`
    INSERT INTO public.portal_task_feedback (client_id, task_id, author_name, status, comment)
    SELECT c.id, t.id, $3, $4, $5
    FROM public.clients c
    JOIN public.tasks t ON t.client_id = c.id AND t.id = $2
    WHERE c.portal_token = $1 AND c.portal_enabled = TRUE
    RETURNING id, client_id, (SELECT name FROM public.clients WHERE id = client_id) AS client_name
  `, [token, taskId, authorName, status, comment]);
  const posted = rows[0];
  if (!posted) return NextResponse.json({ error: "Invalid portal or task" }, { status: 400 });
  const feedbackId = posted.id;

  {
    const statusLabel =
      status === "approved"
        ? "อนุมัติ"
        : status === "changes_requested"
          ? "ขอแก้ไข"
          : "แสดงความคิดเห็น";

    if (posted) {
      const { rows: profiles } = await queryNeon<{ id: string }>(`SELECT id FROM public.profiles`);
      const notifications = profiles.map((profile) => ({
        userId: profile.id,
        title: `✅ ลูกค้า${statusLabel}งาน`,
        body: `${authorName} — ${comment?.slice(0, 60) ?? statusLabel}`,
        link: `/clients/${posted.client_id}`,
        sourceType: "portal_feedback",
        sourceId: feedbackId,
        kind: "system" as const,
      }));
      await deliverNotifications(notifications);
    }
  }

  return NextResponse.json({ id: feedbackId });
}
