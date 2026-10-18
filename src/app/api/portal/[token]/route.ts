import { queryNeon } from "@/lib/neon/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!UUID_RE.test(token)) return NextResponse.json({ error: "Invalid or disabled portal" }, { status: 404 });
  const { rows } = await queryNeon<{ data: unknown }>(`
    SELECT json_build_object(
      'client', json_build_object(
        'id', c.id, 'name', c.name, 'company', c.company,
        'project_type', c.project_type, 'status', c.status, 'description', c.description
      ),
      'tasks', COALESCE((
        SELECT json_agg(row_to_json(t) ORDER BY t.start_date NULLS LAST)
        FROM (
          SELECT id, title, status, progress, start_date, due_date, duration_days
          FROM public.tasks WHERE client_id = c.id AND parent_id IS NULL
        ) t
      ), '[]'::json),
      'invoices', COALESCE((
        SELECT json_agg(row_to_json(i)) FROM (
          SELECT title, total_amount, status, due_date
          FROM public.invoices WHERE client_id = c.id
        ) i
      ), '[]'::json),
      'files', COALESCE((
        SELECT json_agg(row_to_json(f) ORDER BY f.created_at DESC) FROM (
          SELECT name, file_url, file_type, created_at
          FROM public.client_files WHERE client_id = c.id
        ) f
      ), '[]'::json),
      'comments', COALESCE((
        SELECT json_agg(row_to_json(pc) ORDER BY pc.created_at DESC) FROM (
          SELECT author_name, content, task_id, created_at
          FROM public.portal_comments WHERE client_id = c.id ORDER BY created_at DESC LIMIT 50
        ) pc
      ), '[]'::json),
      'feedback', COALESCE((
        SELECT json_agg(row_to_json(pf) ORDER BY pf.created_at DESC) FROM (
          SELECT task_id, author_name, status, comment, created_at
          FROM public.portal_task_feedback WHERE client_id = c.id ORDER BY created_at DESC LIMIT 50
        ) pf
      ), '[]'::json)
    ) AS data
    FROM public.clients c
    WHERE c.portal_token = $1 AND c.portal_enabled = TRUE
  `, [token]);
  const data = rows[0]?.data;
  if (!data) {
    return NextResponse.json({ error: "Invalid or disabled portal" }, { status: 404 });
  }

  return NextResponse.json(data);
}
