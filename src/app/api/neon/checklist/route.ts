import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonPermission } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: unknown) {
  console.error("[neon/checklist]", error);
  return NextResponse.json({ error: "จัดการรายการตรวจไม่สำเร็จ" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) {
      const { rows } = await queryNeon(
        `SELECT task_id, count(*)::int AS total, count(*) FILTER (WHERE done)::int AS done
         FROM public.task_checklist_items GROUP BY task_id`
      );
      return NextResponse.json({ counts: rows });
    }
    if (!UUID_RE.test(taskId)) return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
    const { rows } = await queryNeon(
      `SELECT * FROM public.task_checklist_items WHERE task_id = $1 ORDER BY sort_order, created_at`,
      [taskId]
    );
    return NextResponse.json({ items: rows });
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
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const sortOrder = Number(body.sort_order ?? 0);
    if (!UUID_RE.test(taskId) || !title || title.length > 500 || !Number.isInteger(sortOrder)) {
      return NextResponse.json({ error: "ข้อมูลรายการตรวจไม่ถูกต้อง" }, { status: 400 });
    }
    const { rows } = await queryNeon(
      `INSERT INTO public.task_checklist_items (task_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [taskId, title, sortOrder]
    );
    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_tasks");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id) || typeof body.done !== "boolean") {
      return NextResponse.json({ error: "ข้อมูลรายการตรวจไม่ถูกต้อง" }, { status: 400 });
    }
    const { rows } = await queryNeon(
      `UPDATE public.task_checklist_items SET done = $1 WHERE id = $2 RETURNING *`,
      [body.done, id]
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบรายการตรวจ" }, { status: 404 });
    return NextResponse.json({ item: rows[0] });
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
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสรายการตรวจไม่ถูกต้อง" }, { status: 400 });
    const result = await queryNeon(`DELETE FROM public.task_checklist_items WHERE id = $1`, [id]);
    if (!result.rowCount) return NextResponse.json({ error: "ไม่พบรายการตรวจ" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
