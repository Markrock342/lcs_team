import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";
import type { SavedView } from "@/lib/extras-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGES = new Set(["tasks", "clients", "sales", "finance"]);

function fail(error: unknown) {
  console.error("[neon/saved-views]", error);
  return NextResponse.json({ error: "จัดการมุมมองที่บันทึกไม่สำเร็จ" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const page = new URL(request.url).searchParams.get("page") ?? "";
    if (!PAGES.has(page)) return NextResponse.json({ error: "หน้าที่ระบุไม่ถูกต้อง" }, { status: 400 });
    const { rows } = await queryNeon<SavedView>(
      `SELECT * FROM public.saved_views WHERE user_id=$1 AND page=$2 ORDER BY is_default DESC, created_at`,
      [auth.context.userId, page],
    );
    return NextResponse.json({ views: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { page?: unknown; name?: unknown; filters?: unknown; is_default?: unknown };
    const page = typeof body.page === "string" ? body.page : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!PAGES.has(page) || !name) return NextResponse.json({ error: "ข้อมูลมุมมองไม่ถูกต้อง" }, { status: 400 });
    const view = await withNeonTransaction(async (client) => {
      if (body.is_default === true) {
        await client.query(`UPDATE public.saved_views SET is_default=FALSE WHERE user_id=$1 AND page=$2`, [auth.context.userId, page]);
      }
      const { rows } = await client.query<SavedView>(
        `INSERT INTO public.saved_views (user_id,page,name,filters,is_default)
         VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
        [auth.context.userId, page, name, JSON.stringify(body.filters ?? {}), body.is_default === true],
      );
      return rows[0];
    });
    return NextResponse.json({ view }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "รหัสมุมมองไม่ถูกต้อง" }, { status: 400 });
    }
    await queryNeon(`DELETE FROM public.saved_views WHERE id=$1 AND user_id=$2`, [body.id, auth.context.userId]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
