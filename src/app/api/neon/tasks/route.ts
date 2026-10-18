import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonPermission } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
import { normalizePgClient } from "@/lib/neon/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_FIELDS = [
  "title",
  "description",
  "client_id",
  "parent_id",
  "status",
  "priority",
  "assigned_to",
  "start_date",
  "due_date",
  "duration_days",
  "progress",
  "image_url",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_STATUSES = new Set(["pending", "waiting", "in_progress", "review", "done"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function jsonError(error: unknown, status = 500) {
  console.error("[neon/tasks]", error);
  return NextResponse.json({ error: "เกิดข้อผิดพลาดในการจัดการข้อมูลงาน" }, { status });
}

function nullableText(value: unknown, field: string, max = 20_000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new Error(`ข้อมูล ${field} ไม่ถูกต้อง`);
  return value.trim() || null;
}

function nullableUuid(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${field} ไม่ถูกต้อง`);
  return value;
}

function nullableDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_RE.test(value)) throw new Error(`${field} ไม่ถูกต้อง`);
  return value;
}

function taskPayload(body: Record<string, unknown>) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 500) throw new Error("กรุณาระบุชื่องาน");
  const status = body.status ?? "pending";
  const priority = body.priority ?? "medium";
  if (typeof status !== "string" || !TASK_STATUSES.has(status)) throw new Error("สถานะงานไม่ถูกต้อง");
  if (typeof priority !== "string" || !TASK_PRIORITIES.has(priority)) throw new Error("ความสำคัญงานไม่ถูกต้อง");

  const duration = body.duration_days === undefined || body.duration_days === "" ? 1 : Number(body.duration_days);
  const progress = body.progress === undefined || body.progress === "" ? 0 : Number(body.progress);
  if (!Number.isInteger(duration) || duration < 1 || duration > 3650) throw new Error("จำนวนวันไม่ถูกต้อง");
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new Error("ความคืบหน้าไม่ถูกต้อง");

  return {
    title,
    description: nullableText(body.description, "รายละเอียด"),
    client_id: nullableUuid(body.client_id, "ลูกค้า"),
    parent_id: nullableUuid(body.parent_id, "งานหลัก"),
    status,
    priority,
    assigned_to: nullableUuid(body.assigned_to, "ผู้รับผิดชอบ"),
    start_date: nullableDate(body.start_date, "วันที่เริ่ม"),
    due_date: nullableDate(body.due_date, "กำหนดส่ง"),
    duration_days: duration,
    progress,
    image_url: nullableText(body.image_url, "ภาพงาน", 2_000),
  };
}

const TASK_SELECT = `
  SELECT
    t.*,
    CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END AS client,
    CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS assignee
  FROM public.tasks t
  LEFT JOIN public.clients c ON c.id = t.client_id
  LEFT JOIN public.profiles p ON p.id = t.assigned_to
`;

export async function GET() {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [tasksResult, clientsResult, profilesResult] = await Promise.all([
      queryNeon(`${TASK_SELECT} ORDER BY t.created_at DESC NULLS LAST`),
      queryNeon(`SELECT * FROM public.clients ORDER BY name`),
      queryNeon(`SELECT * FROM public.profiles ORDER BY display_name`),
    ]);
    return NextResponse.json({
      tasks: tasksResult.rows,
      clients: clientsResult.rows.map(normalizePgClient),
      profiles: profilesResult.rows,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_tasks");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as Record<string, unknown>;
    const payload = taskPayload(body);
    const requestedId = body.id === undefined ? null : nullableUuid(body.id, "รหัสงาน");
    const values = TASK_FIELDS.map((field) => payload[field]);
    const columns = TASK_FIELDS.join(", ");
    const placeholders = TASK_FIELDS.map((_, index) => `$${index + 1}`).join(", ");
    const { rows } = await queryNeon(
      `INSERT INTO public.tasks (${requestedId ? "id, " : ""}${columns}, created_by)
       VALUES (${requestedId ? `$1, ${TASK_FIELDS.map((_, index) => `$${index + 2}`).join(", ")}` : placeholders}, $${TASK_FIELDS.length + (requestedId ? 2 : 1)})
       RETURNING *`,
      requestedId ? [requestedId, ...values, auth.context.userId] : [...values, auth.context.userId]
    );
    return NextResponse.json({ task: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /กรุณา|ไม่ถูกต้อง|สถานะ|ความสำคัญ|จำนวนวัน|ความคืบหน้า/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_tasks");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });

    if (Object.keys(body).every((key) => key === "id" || key === "status" || key === "progress")) {
      const updates: string[] = [];
      const values: unknown[] = [];
      if (body.status !== undefined) {
        if (typeof body.status !== "string" || !TASK_STATUSES.has(body.status)) {
          return NextResponse.json({ error: "สถานะงานไม่ถูกต้อง" }, { status: 400 });
        }
        values.push(body.status);
        updates.push(`status = $${values.length}`);
      }
      if (body.progress !== undefined) {
        const progress = Number(body.progress);
        if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
          return NextResponse.json({ error: "ความคืบหน้าไม่ถูกต้อง" }, { status: 400 });
        }
        values.push(progress);
        updates.push(`progress = $${values.length}`);
      }
      if (!updates.length) return NextResponse.json({ error: "ไม่มีข้อมูลที่ต้องแก้ไข" }, { status: 400 });
      values.push(id);
      const { rows } = await queryNeon(
        `UPDATE public.tasks SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
      return NextResponse.json({ task: rows[0] });
    }

    const updates = taskPayload(body);
    const setSql = TASK_FIELDS.map((field, index) => `${field} = $${index + 1}`).join(", ");
    const { rows } = await queryNeon(
      `UPDATE public.tasks SET ${setSql}, updated_at = NOW()
       WHERE id = $${TASK_FIELDS.length + 1}
       RETURNING *`,
      [...TASK_FIELDS.map((field) => updates[field]), id]
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    return NextResponse.json({ task: rows[0] });
  } catch (error) {
    if (error instanceof Error && /กรุณา|ไม่ถูกต้อง|สถานะ|ความสำคัญ|จำนวนวัน|ความคืบหน้า/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_tasks");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
    const result = await queryNeon(`DELETE FROM public.tasks WHERE id = $1`, [id]);
    if (!result.rowCount) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
