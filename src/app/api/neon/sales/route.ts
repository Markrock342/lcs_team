import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonEditor } from "@/lib/neon/auth";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLES = {
  deal: {
    table: "sales_deals",
    fields: ["id", "title", "client_id", "company", "contact_name", "contact_phone", "contact_email", "value", "stage", "owner_id", "notes", "next_follow_up"],
  },
  prospect: {
    table: "sales_prospects",
    fields: ["id", "name", "company", "contact_name", "contact_phone", "contact_email", "address", "province", "source", "status", "owner_id", "next_follow_up", "notes", "deal_id", "client_id", "import_batch_id", "external_key", "extra"],
  },
  interaction: {
    table: "sales_interactions",
    fields: ["id", "prospect_id", "deal_id", "type", "outcome", "content", "ai_generated"],
  },
} as const;

type Resource = keyof typeof TABLES;
type Input = Record<string, unknown>;

function resourceConfig(value: unknown) {
  if (typeof value !== "string" || !(value in TABLES)) return null;
  return TABLES[value as Resource];
}

function filteredData(config: (typeof TABLES)[Resource], data: Input) {
  return Object.fromEntries(config.fields.filter((field) => data[field] !== undefined).map((field) => [field, data[field]]));
}

function normalizedJsonValue(field: string, value: unknown) {
  return field === "extra" && value !== null ? JSON.stringify(value) : value;
}

function normalizeDeal<T extends Input>(row: T) {
  return { ...row, value: row.value == null ? null : Number(row.value) };
}

function fail(error: unknown) {
  console.error("[neon/sales]", error);
  return NextResponse.json({ error: "จัดการข้อมูลฝ่ายขายไม่สำเร็จ" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const prospectId = new URL(request.url).searchParams.get("prospectId");
    if (prospectId) {
      if (!UUID_RE.test(prospectId)) return NextResponse.json({ error: "รหัสรายชื่อไม่ถูกต้อง" }, { status: 400 });
      const { rows } = await queryNeon(
        `SELECT i.*, CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS creator
         FROM public.sales_interactions i
         LEFT JOIN public.profiles p ON p.id = i.created_by
         WHERE i.prospect_id = $1 ORDER BY i.created_at DESC`,
        [prospectId]
      );
      return NextResponse.json({ interactions: rows });
    }
    const [deals, prospects] = await Promise.all([
      queryNeon(`SELECT d.*,
        CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END AS client,
        CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS owner
        FROM public.sales_deals d
        LEFT JOIN public.clients c ON c.id = d.client_id
        LEFT JOIN public.profiles p ON p.id = d.owner_id
        ORDER BY d.updated_at DESC`),
      queryNeon(`SELECT s.*,
        CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS owner,
        CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END AS client
        FROM public.sales_prospects s
        LEFT JOIN public.profiles p ON p.id = s.owner_id
        LEFT JOIN public.clients c ON c.id = s.client_id
        ORDER BY s.updated_at DESC`),
    ]);
    return NextResponse.json({ deals: deals.rows.map(normalizeDeal), prospects: prospects.rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { resource?: unknown; data?: unknown };
    const config = resourceConfig(body.resource);
    if (!config) return NextResponse.json({ error: "ประเภทข้อมูลไม่ถูกต้อง" }, { status: 400 });
    const inputRows = Array.isArray(body.data) ? body.data : [body.data];
    if (!inputRows.length || inputRows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    const created = await withNeonTransaction(async (client) => {
      const rows: Input[] = [];
      for (const raw of inputRows as Input[]) {
        const data = filteredData(config, raw);
        const fields = Object.keys(data);
        if (!fields.length) throw new Error("empty sales payload");
        const values = fields.map((field) => normalizedJsonValue(field, data[field]));
        const placeholders = fields.map((field, index) => `$${index + 1}${field === "extra" ? "::jsonb" : ""}`);
        const result = await client.query(
          `INSERT INTO public.${config.table} (${fields.join(", ")}, created_by)
           VALUES (${placeholders.join(", ")}, $${fields.length + 1}) RETURNING *`,
          [...values, auth.context.userId]
        );
        rows.push(result.rows[0]);
      }
      return rows;
    });
    const normalized = body.resource === "deal" ? created.map(normalizeDeal) : created;
    return NextResponse.json({ rows: normalized, row: normalized[0] }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { resource?: unknown; id?: unknown; data?: unknown };
    const config = resourceConfig(body.resource);
    if (!config || typeof body.id !== "string" || !UUID_RE.test(body.id) || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    const data = filteredData(config, body.data as Input);
    delete data.id;
    const fields = Object.keys(data);
    if (!fields.length) return NextResponse.json({ error: "ไม่มีข้อมูลให้อัปเดต" }, { status: 400 });
    const values = fields.map((field) => normalizedJsonValue(field, data[field]));
    const sets = fields.map((field, index) => `${field} = $${index + 1}${field === "extra" ? "::jsonb" : ""}`);
    const updatedAt = config.table === "sales_interactions" ? "" : ", updated_at = NOW()";
    const { rows } = await queryNeon(
      `UPDATE public.${config.table} SET ${sets.join(", ")}${updatedAt}
       WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, body.id]
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    return NextResponse.json({ row: body.resource === "deal" ? normalizeDeal(rows[0]) : rows[0] });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { resource?: unknown; id?: unknown; ids?: unknown };
    const config = resourceConfig(body.resource);
    const ids = Array.isArray(body.ids) ? body.ids : [body.id];
    if (!config || !ids.length || ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    const result = await queryNeon(`DELETE FROM public.${config.table} WHERE id = ANY($1::uuid[])`, [ids]);
    return NextResponse.json({ ok: true, deleted: result.rowCount ?? 0 });
  } catch (error) {
    return fail(error);
  }
}
