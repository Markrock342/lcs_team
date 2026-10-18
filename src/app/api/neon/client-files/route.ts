import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonPermission } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
    if (!UUID_RE.test(clientId)) return NextResponse.json({ error: "รหัสลูกค้าไม่ถูกต้อง" }, { status: 400 });
    const { rows } = await queryNeon(
      `SELECT * FROM public.client_files WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );
    return NextResponse.json({ files: rows });
  } catch (error) {
    console.error("[neon/client-files:get]", error);
    return NextResponse.json({ error: "โหลดไฟล์ลูกค้าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_clients");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as Record<string, unknown>;
    const clientId = typeof body.client_id === "string" ? body.client_id : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    if (!UUID_RE.test(clientId) || !name || name.length > 500 || !fileUrl || fileUrl.length > 2_000) {
      return NextResponse.json({ error: "ข้อมูลไฟล์ไม่ถูกต้อง" }, { status: 400 });
    }
    const fileType = typeof body.file_type === "string" ? body.file_type.slice(0, 255) : null;
    const fileSize = typeof body.file_size === "number" && Number.isSafeInteger(body.file_size) && body.file_size >= 0
      ? body.file_size
      : null;
    const { rows } = await queryNeon(
      `INSERT INTO public.client_files
         (client_id, name, file_url, file_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [clientId, name, fileUrl, fileType, fileSize, auth.context.userId]
    );
    return NextResponse.json({ file: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("[neon/client-files:post]", error);
    return NextResponse.json({ error: "บันทึกไฟล์ลูกค้าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonPermission("manage_clients");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
    const result = await queryNeon(`DELETE FROM public.client_files WHERE id = $1`, [id]);
    if (!result.rowCount) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[neon/client-files:delete]", error);
    return NextResponse.json({ error: "ลบไฟล์ลูกค้าไม่สำเร็จ" }, { status: 500 });
  }
}
