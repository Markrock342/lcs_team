import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonPermission } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: unknown) {
  console.error("[neon/task-attachments]", error);
  return NextResponse.json({ error: "จัดการไฟล์แนบงานไม่สำเร็จ" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) {
      const { rows } = await queryNeon(
        `SELECT task_id, count(*)::int AS count FROM public.task_attachments GROUP BY task_id`
      );
      return NextResponse.json({ counts: rows });
    }
    if (!UUID_RE.test(taskId)) return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
    const { rows } = await queryNeon(
      `SELECT * FROM public.task_attachments WHERE task_id = $1 ORDER BY created_at DESC`,
      [taskId]
    );
    return NextResponse.json({ attachments: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_tasks");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as Record<string, unknown>;
    const taskId = typeof body.task_id === "string" ? body.task_id : "";
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
    const fileType = typeof body.file_type === "string" ? body.file_type.trim() || null : null;
    const fileSize = body.file_size == null ? null : Number(body.file_size);
    if (!UUID_RE.test(taskId) || !fileUrl || fileUrl.length > 4_000 || !fileName || fileName.length > 500 ||
        (fileSize !== null && (!Number.isFinite(fileSize) || fileSize < 0))) {
      return NextResponse.json({ error: "ข้อมูลไฟล์แนบไม่ถูกต้อง" }, { status: 400 });
    }
    const { rows } = await queryNeon(
      `INSERT INTO public.task_attachments
       (task_id, file_url, file_name, file_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [taskId, fileUrl, fileName, fileType, fileSize, auth.context.userId]
    );
    return NextResponse.json({ attachment: rows[0] }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_tasks");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสไฟล์แนบไม่ถูกต้อง" }, { status: 400 });
    const result = await queryNeon(`DELETE FROM public.task_attachments WHERE id = $1`, [id]);
    if (!result.rowCount) return NextResponse.json({ error: "ไม่พบไฟล์แนบ" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
