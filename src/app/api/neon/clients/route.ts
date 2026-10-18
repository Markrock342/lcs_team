import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonPermission } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
import { normalizePgClient } from "@/lib/neon/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_FIELDS = [
  "name",
  "contact_name",
  "contact_phone",
  "contact_email",
  "company",
  "project_type",
  "description",
  "budget",
  "notes",
  "status",
  "image_url",
  "repo_url",
  "supabase_url",
  "figma_url",
  "staging_url",
  "production_url",
  "docs_url",
  "drive_url",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_STATUSES = new Set(["lead", "active", "completed", "paused"]);
const PROJECT_TYPES = new Set([
  "mobile_app",
  "web_app",
  "website",
  "system",
  "design",
  "maintenance",
  "consulting",
  "other",
]);

function jsonError(error: unknown, status = 500) {
  console.error("[neon/clients]", error);
  return NextResponse.json({ error: "เกิดข้อผิดพลาดในการจัดการข้อมูลลูกค้า" }, { status });
}

function nullableText(value: unknown, field: string, max = 20_000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) {
    throw new Error(`ข้อมูล ${field} ไม่ถูกต้อง`);
  }
  return value.trim() || null;
}

function clientPayload(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) throw new Error("กรุณาระบุชื่อลูกค้า");

  const projectType = body.project_type ?? "other";
  const status = body.status ?? "lead";
  if (typeof projectType !== "string" || !PROJECT_TYPES.has(projectType)) {
    throw new Error("ประเภทโปรเจกต์ไม่ถูกต้อง");
  }
  if (typeof status !== "string" || !CLIENT_STATUSES.has(status)) {
    throw new Error("สถานะลูกค้าไม่ถูกต้อง");
  }

  let budget: number | null = null;
  if (body.budget !== undefined && body.budget !== null && body.budget !== "") {
    budget = typeof body.budget === "number" ? body.budget : Number(body.budget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 999_999_999_999) {
      throw new Error("งบประมาณไม่ถูกต้อง");
    }
  }

  return {
    name,
    contact_name: nullableText(body.contact_name, "ชื่อผู้ติดต่อ", 200),
    contact_phone: nullableText(body.contact_phone, "เบอร์โทร", 100),
    contact_email: nullableText(body.contact_email, "อีเมล", 320),
    company: nullableText(body.company, "บริษัท", 200),
    project_type: projectType,
    description: nullableText(body.description, "รายละเอียด"),
    budget,
    notes: nullableText(body.notes, "หมายเหตุ"),
    status,
    image_url: nullableText(body.image_url, "ภาพปก", 2_000),
    repo_url: nullableText(body.repo_url, "Repository URL", 2_000),
    supabase_url: nullableText(body.supabase_url, "Supabase URL", 2_000),
    figma_url: nullableText(body.figma_url, "Figma URL", 2_000),
    staging_url: nullableText(body.staging_url, "Staging URL", 2_000),
    production_url: nullableText(body.production_url, "Production URL", 2_000),
    docs_url: nullableText(body.docs_url, "Docs URL", 2_000),
    drive_url: nullableText(body.drive_url, "Drive URL", 2_000),
  };
}

export async function GET() {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { rows } = await queryNeon(`
      SELECT *
      FROM public.clients
      ORDER BY created_at DESC NULLS LAST
    `);
    return NextResponse.json({ clients: rows.map(normalizePgClient) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_clients");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as Record<string, unknown>;
    const payload = clientPayload(body);
    const values = CLIENT_FIELDS.map((field) => payload[field]);
    const columns = CLIENT_FIELDS.join(", ");
    const placeholders = CLIENT_FIELDS.map((_, index) => `$${index + 1}`).join(", ");
    const { rows } = await queryNeon(
      `INSERT INTO public.clients (${columns}, created_by)
       VALUES (${placeholders}, $${CLIENT_FIELDS.length + 1})
       RETURNING *`,
      [...values, auth.context.userId]
    );
    return NextResponse.json({ client: normalizePgClient(rows[0]) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /กรุณา|ไม่ถูกต้อง|ประเภท|สถานะ|งบประมาณ/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_clients");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสลูกค้าไม่ถูกต้อง" }, { status: 400 });

    if (Object.prototype.hasOwnProperty.call(body, "portal_enabled")) {
      if (typeof body.portal_enabled !== "boolean") {
        return NextResponse.json({ error: "สถานะพอร์ทัลไม่ถูกต้อง" }, { status: 400 });
      }
      const { rows } = await queryNeon(
        `UPDATE public.clients
         SET portal_enabled = $1,
             portal_token = CASE
               WHEN $1 = TRUE THEN COALESCE(portal_token, gen_random_uuid())
               ELSE portal_token
             END,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [body.portal_enabled, id]
      );
      if (!rows[0]) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });
      return NextResponse.json({ client: normalizePgClient(rows[0]) });
    }

    const updates = clientPayload(body);
    const setSql = CLIENT_FIELDS.map((field, index) => `${field} = $${index + 1}`).join(", ");
    const { rows } = await queryNeon(
      `UPDATE public.clients SET ${setSql}, updated_at = NOW()
       WHERE id = $${CLIENT_FIELDS.length + 1}
       RETURNING *`,
      [...CLIENT_FIELDS.map((field) => updates[field]), id]
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });
    return NextResponse.json({ client: normalizePgClient(rows[0]) });
  } catch (error) {
    if (error instanceof Error && /กรุณา|ไม่ถูกต้อง|ประเภท|สถานะ|งบประมาณ/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_clients");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสลูกค้าไม่ถูกต้อง" }, { status: 400 });
    const result = await queryNeon(`DELETE FROM public.clients WHERE id = $1`, [id]);
    if (!result.rowCount) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
