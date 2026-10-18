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
  const content = String(body.content ?? "").trim();
  const taskId = body.task_id ?? null;

  if (!UUID_RE.test(token) || !authorName || !content || authorName.length > 200 || content.length > 10_000) {
    return NextResponse.json({ error: "กรอกชื่อและข้อความ" }, { status: 400 });
  }
  if (taskId && (typeof taskId !== "string" || !UUID_RE.test(taskId))) {
    return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
  }

  const { rows } = await queryNeon<{ id: string; client_id: string; client_name: string }>(`
    INSERT INTO public.portal_comments (client_id, author_name, content, task_id)
    SELECT c.id, $2, $3, $4
    FROM public.clients c
    WHERE c.portal_token = $1 AND c.portal_enabled = TRUE
      AND ($4::uuid IS NULL OR EXISTS (
        SELECT 1 FROM public.tasks t WHERE t.id = $4 AND t.client_id = c.id
      ))
    RETURNING id, client_id, (SELECT name FROM public.clients WHERE id = client_id) AS client_name
  `, [token, authorName, content, taskId]);
  const posted = rows[0];
  if (!posted) return NextResponse.json({ error: "Invalid portal or task" }, { status: 400 });
  const commentId = posted.id;

  if (posted) {
      const { rows: profiles } = await queryNeon<{ id: string }>(`SELECT id FROM public.profiles`);
      const notifications = profiles.map((profile) => ({
        userId: profile.id,
        title: "💬 ลูกค้าตอบใน Portal",
        body: `${authorName} (${posted.client_name}): ${content.slice(0, 80)}`,
        link: `/clients/${posted.client_id}`,
        sourceType: "portal_comment",
        sourceId: commentId,
        kind: "system" as const,
      }));
      await deliverNotifications(notifications);
  }

  return NextResponse.json({ id: commentId });
}
