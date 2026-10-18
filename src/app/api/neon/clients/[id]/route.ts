import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
import { normalizePgClient, normalizePgInvoice } from "@/lib/neon/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: unknown, status = 500) {
  console.error("[neon/clients/:id]", error);
  return NextResponse.json({ error: "โหลดข้อมูลลูกค้าไม่สำเร็จ" }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "รหัสลูกค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const [clientResult, tasksResult, activityResult, invoiceResult, fileResult, portalResult] = await Promise.all([
      queryNeon(`SELECT * FROM public.clients WHERE id = $1 LIMIT 1`, [id]),
      queryNeon(
        `SELECT
           t.*,
           CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS assignee
         FROM public.tasks t
         LEFT JOIN public.profiles p ON p.id = t.assigned_to
         WHERE t.client_id = $1 AND t.parent_id IS NULL
         ORDER BY t.updated_at DESC NULLS LAST`,
        [id]
      ),
      queryNeon(
        `SELECT
           a.*,
           CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS "user"
         FROM public.activity_logs a
         LEFT JOIN public.profiles p ON p.id = a.user_id
         WHERE a.entity_id = $1
            OR (a.entity_type = 'task' AND a.entity_id IN (
              SELECT id FROM public.tasks WHERE client_id = $1
            ))
         ORDER BY a.created_at DESC
         LIMIT 60`,
        [id]
      ),
      queryNeon(
        `SELECT * FROM public.invoices WHERE client_id = $1 ORDER BY updated_at DESC NULLS LAST`,
        [id]
      ),
      queryNeon(
        `SELECT * FROM public.client_files WHERE client_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      queryNeon(
        `SELECT author_name, content, created_at
         FROM public.portal_comments WHERE client_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [id]
      ),
    ]);

    const client = clientResult.rows[0];
    if (!client) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });
    return NextResponse.json({
      client: normalizePgClient(client),
      tasks: tasksResult.rows,
      activities: activityResult.rows,
      invoices: invoiceResult.rows.map(normalizePgInvoice),
      files: fileResult.rows,
      portalComments: portalResult.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
