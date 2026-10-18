import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
    const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 100, 1), 250);
    const { rows } = await queryNeon(
      `SELECT
         a.*,
         CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS "user"
       FROM public.activity_logs a
       LEFT JOIN public.profiles p ON p.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return NextResponse.json({ activities: rows });
  } catch (error) {
    console.error("[neon/activity:get]", error);
    return NextResponse.json({ error: "โหลดประวัติกิจกรรมไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const entityType = typeof body.entityType === "string" ? body.entityType.trim() : "";
    const entityTitle = typeof body.entityTitle === "string" ? body.entityTitle.trim() : "";
    const entityId = body.entityId === null || body.entityId === undefined ? null : body.entityId;
    if (!action || action.length > 100 || !entityType || entityType.length > 100 || entityTitle.length > 500) {
      return NextResponse.json({ error: "ข้อมูลกิจกรรมไม่ถูกต้อง" }, { status: 400 });
    }
    if (entityId !== null && (typeof entityId !== "string" || !UUID_RE.test(entityId))) {
      return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
    }
    const details = body.details && typeof body.details === "object" && !Array.isArray(body.details)
      ? body.details
      : null;
    const { rows } = await queryNeon(
      `INSERT INTO public.activity_logs
         (user_id, action, entity_type, entity_id, entity_title, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [auth.context.userId, action, entityType, entityId, entityTitle || null, details ? JSON.stringify(details) : null]
    );
    return NextResponse.json({ activity: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("[neon/activity:post]", error);
    return NextResponse.json({ error: "บันทึกกิจกรรมไม่สำเร็จ" }, { status: 500 });
  }
}
