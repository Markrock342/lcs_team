import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonEditor } from "@/lib/neon/auth";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";
import type { TaskTemplate, TaskTemplateItem } from "@/lib/extras-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TemplateInput = {
  name?: unknown;
  description?: unknown;
  project_type?: unknown;
  items?: Array<Partial<TaskTemplateItem>>;
};

function fail(error: unknown) {
  console.error("[neon/templates]", error);
  return NextResponse.json({ error: "จัดการเทมเพลตไม่สำเร็จ" }, { status: 500 });
}

function normalizedItems(items: TemplateInput["items"]) {
  return (items ?? [])
    .filter((item) => typeof item.title === "string" && item.title.trim())
    .map((item, index) => ({
      title: String(item.title).trim(),
      description: typeof item.description === "string" && item.description.trim()
        ? item.description.trim()
        : null,
      suggested_role: typeof item.suggested_role === "string" && item.suggested_role
        ? item.suggested_role
        : null,
      duration_days: Math.max(1, Number(item.duration_days) || 3),
      sort_order: index + 1,
    }));
}

export async function GET() {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { rows } = await queryNeon<TaskTemplate>(
      `SELECT t.*,
       COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order)
         FROM public.task_template_items i WHERE i.template_id = t.id), '[]'::jsonb) AS items
       FROM public.task_templates t ORDER BY t.name`,
    );
    return NextResponse.json({ templates: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as TemplateInput;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "ชื่อเทมเพลตไม่ถูกต้อง" }, { status: 400 });
    }
    const items = normalizedItems(body.items);
    const template = await withNeonTransaction(async (client) => {
      const inserted = await client.query<TaskTemplate>(
        `INSERT INTO public.task_templates (name, description, project_type, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, body.description ?? null, body.project_type ?? null, auth.context.userId],
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO public.task_template_items
           (template_id, title, description, suggested_role, duration_days, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [inserted.rows[0].id, item.title, item.description, item.suggested_role, item.duration_days, item.sort_order],
        );
      }
      return { ...inserted.rows[0], items };
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as TemplateInput & { id?: unknown };
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "รหัสเทมเพลตไม่ถูกต้อง" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "ชื่อเทมเพลตไม่ถูกต้อง" }, { status: 400 });
    }
    const items = normalizedItems(body.items);
    const template = await withNeonTransaction(async (client) => {
      const updated = await client.query<TaskTemplate>(
        `UPDATE public.task_templates SET name=$1, description=$2, project_type=$3
         WHERE id=$4 RETURNING *`,
        [name, body.description ?? null, body.project_type ?? null, body.id],
      );
      if (!updated.rows[0]) return null;
      await client.query(`DELETE FROM public.task_template_items WHERE template_id=$1`, [body.id]);
      for (const item of items) {
        await client.query(
          `INSERT INTO public.task_template_items
           (template_id, title, description, suggested_role, duration_days, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [body.id, item.title, item.description, item.suggested_role, item.duration_days, item.sort_order],
        );
      }
      return { ...updated.rows[0], items };
    });
    if (!template) return NextResponse.json({ error: "ไม่พบเทมเพลต" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "รหัสเทมเพลตไม่ถูกต้อง" }, { status: 400 });
    }
    await queryNeon(`DELETE FROM public.task_templates WHERE id=$1`, [body.id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
