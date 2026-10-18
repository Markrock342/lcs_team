import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonEditor } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
import type { TimeEntry } from "@/lib/extras-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: unknown) {
  console.error("[neon/time-entries]", error);
  return NextResponse.json({ error: "จัดการเวลาทำงานไม่สำเร็จ" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const url = new URL(request.url);
    const taskId = url.searchParams.get("taskId");
    if (taskId && !UUID_RE.test(taskId)) {
      return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
    }
    const values: unknown[] = [];
    const where = taskId ? (values.push(taskId), `WHERE te.task_id = $1`) : "WHERE te.ended_at IS NOT NULL";
    const limit = taskId ? "LIMIT 5" : "";
    const { rows } = await queryNeon<TimeEntry>(
      `SELECT te.*, CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS "user"
       FROM public.time_entries te
       LEFT JOIN public.profiles p ON p.id = te.user_id
       ${where} ORDER BY te.started_at DESC ${limit}`,
      values,
    );
    return NextResponse.json({ entries: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { task_id?: unknown; started_at?: unknown; note?: unknown };
    if (typeof body.task_id !== "string" || !UUID_RE.test(body.task_id)) {
      return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
    }
    const { rows } = await queryNeon<TimeEntry>(
      `INSERT INTO public.time_entries (task_id, user_id, started_at, note)
       VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4) RETURNING *`,
      [body.task_id, auth.context.userId, body.started_at ?? null, body.note ?? null],
    );
    return NextResponse.json({ entry: rows[0] }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown; ended_at?: unknown; duration_minutes?: unknown };
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "รหัสรายการเวลาไม่ถูกต้อง" }, { status: 400 });
    }
    const { rows } = await queryNeon<TimeEntry>(
      `UPDATE public.time_entries
       SET ended_at = COALESCE($1::timestamptz, NOW()), duration_minutes = $2
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [body.ended_at ?? null, Number(body.duration_minutes ?? 0), body.id, auth.context.userId],
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบรายการเวลาหรือไม่มีสิทธิ์" }, { status: 404 });
    return NextResponse.json({ entry: rows[0] });
  } catch (error) {
    return fail(error);
  }
}
