import { NextResponse } from "next/server";
import { getNeonAuthContext, requireNeonEditor } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
import { normalizePgClient, normalizePgInvoice } from "@/lib/neon/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(["draft", "sent", "partial", "paid", "overdue"]);
const DOCUMENT_TYPES = new Set(["invoice", "receipt", "proposal", "quotation", "agreement"]);

const INVOICE_FIELDS = [
  "client_id",
  "title",
  "total_amount",
  "status",
  "due_date",
  "notes",
  "document_type",
  "doc_number",
  "issue_date",
  "payment_method",
  "amount_in_words",
  "vat_amount",
  "line_items",
  "document_meta",
] as const;

const INVOICE_SELECT = `
  SELECT
    i.*,
    CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END AS client,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.paid_at, p.created_at)
       FROM public.invoice_payments p WHERE p.invoice_id = i.id),
      '[]'::jsonb
    ) AS payments
  FROM public.invoices i
  LEFT JOIN public.clients c ON c.id = i.client_id
`;

function nullableText(value: unknown, field: string, max = 20_000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} ไม่ถูกต้อง`);
  return value.trim() || null;
}

function nullableDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_RE.test(value)) throw new Error(`${field} ไม่ถูกต้อง`);
  return value;
}

function nullableUuid(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${field} ไม่ถูกต้อง`);
  return value;
}

function invoicePayload(body: Record<string, unknown>) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 500) throw new Error("กรุณาระบุชื่อเอกสาร");
  const total = Number(body.total_amount ?? 0);
  const vat = Number(body.vat_amount ?? 0);
  if (!Number.isFinite(total) || total < 0 || total > 999_999_999_999) throw new Error("ยอดรวมไม่ถูกต้อง");
  if (!Number.isFinite(vat) || vat < 0 || vat > total) throw new Error("ยอดภาษีไม่ถูกต้อง");

  const status = body.status ?? "draft";
  const documentType = body.document_type ?? "invoice";
  if (typeof status !== "string" || !STATUSES.has(status)) throw new Error("สถานะเอกสารไม่ถูกต้อง");
  if (typeof documentType !== "string" || !DOCUMENT_TYPES.has(documentType)) throw new Error("ประเภทเอกสารไม่ถูกต้อง");

  const lineItems = body.line_items === undefined || body.line_items === null ? [] : body.line_items;
  const documentMeta = body.document_meta === undefined || body.document_meta === null ? {} : body.document_meta;
  if (!Array.isArray(lineItems)) throw new Error("รายการเอกสารไม่ถูกต้อง");
  if (typeof documentMeta !== "object" || Array.isArray(documentMeta)) throw new Error("ข้อมูลเอกสารไม่ถูกต้อง");

  return {
    client_id: nullableUuid(body.client_id, "ลูกค้า"),
    title,
    total_amount: total,
    status,
    due_date: nullableDate(body.due_date, "วันครบกำหนด"),
    notes: nullableText(body.notes, "หมายเหตุ"),
    document_type: documentType,
    doc_number: nullableText(body.doc_number, "เลขที่เอกสาร", 100),
    issue_date: nullableDate(body.issue_date, "วันที่ออกเอกสาร"),
    payment_method: nullableText(body.payment_method, "วิธีชำระ", 500),
    amount_in_words: nullableText(body.amount_in_words, "จำนวนเงินตัวอักษร", 1_000),
    vat_amount: vat,
    line_items: JSON.stringify(lineItems),
    document_meta: JSON.stringify(documentMeta),
  };
}

function validationError(error: unknown) {
  return error instanceof Error && /กรุณา|ไม่ถูกต้อง|ยอด|สถานะ|ประเภท|วัน|ลูกค้า|รายการ/.test(error.message);
}

export async function GET() {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const [invoiceResult, clientResult] = await Promise.all([
      queryNeon(`${INVOICE_SELECT} ORDER BY i.created_at DESC`),
      queryNeon(`SELECT * FROM public.clients ORDER BY name`),
    ]);
    return NextResponse.json({
      invoices: invoiceResult.rows.map(normalizePgInvoice),
      clients: clientResult.rows.map(normalizePgClient),
    });
  } catch (error) {
    console.error("[neon/invoices:get]", error);
    return NextResponse.json({ error: "โหลดเอกสารไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as Record<string, unknown>;
    const payload = invoicePayload(body);
    const columns = INVOICE_FIELDS.join(", ");
    const placeholders = INVOICE_FIELDS.map((_, index) => {
      const field = INVOICE_FIELDS[index];
      return field === "line_items" || field === "document_meta" ? `$${index + 1}::jsonb` : `$${index + 1}`;
    }).join(", ");
    const { rows } = await queryNeon(
      `INSERT INTO public.invoices (${columns}, created_by)
       VALUES (${placeholders}, $${INVOICE_FIELDS.length + 1})
       RETURNING *`,
      [...INVOICE_FIELDS.map((field) => payload[field]), auth.context.userId]
    );
    return NextResponse.json({ invoice: normalizePgInvoice(rows[0]) }, { status: 201 });
  } catch (error) {
    if (validationError(error)) return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    console.error("[neon/invoices:post]", error);
    return NextResponse.json({ error: "บันทึกเอกสารไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสเอกสารไม่ถูกต้อง" }, { status: 400 });

    const partialKeys = Object.keys(body).filter((key) => key !== "id");
    const partialAllowed = new Set(["status", "payment_method", "document_meta"]);
    if (partialKeys.length > 0 && partialKeys.every((key) => partialAllowed.has(key))) {
      const sets: string[] = [];
      const values: unknown[] = [];
      if (Object.prototype.hasOwnProperty.call(body, "status")) {
        if (typeof body.status !== "string" || !STATUSES.has(body.status)) throw new Error("สถานะเอกสารไม่ถูกต้อง");
        values.push(body.status);
        sets.push(`status = $${values.length}`);
      }
      if (Object.prototype.hasOwnProperty.call(body, "payment_method")) {
        values.push(nullableText(body.payment_method, "วิธีชำระ", 500));
        sets.push(`payment_method = $${values.length}`);
      }
      if (Object.prototype.hasOwnProperty.call(body, "document_meta")) {
        if (!body.document_meta || typeof body.document_meta !== "object" || Array.isArray(body.document_meta)) {
          throw new Error("ข้อมูลเอกสารไม่ถูกต้อง");
        }
        values.push(JSON.stringify(body.document_meta));
        sets.push(`document_meta = $${values.length}::jsonb`);
      }
      if (!sets.length) return NextResponse.json({ error: "ไม่มีข้อมูลให้อัปเดต" }, { status: 400 });
      values.push(id);
      const { rows } = await queryNeon(
        `UPDATE public.invoices SET ${sets.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
      return NextResponse.json({ invoice: normalizePgInvoice(rows[0]) });
    }

    const payload = invoicePayload(body);
    const sets = INVOICE_FIELDS.map((field, index) => {
      const cast = field === "line_items" || field === "document_meta" ? "::jsonb" : "";
      return `${field} = $${index + 1}${cast}`;
    }).join(", ");
    const { rows } = await queryNeon(
      `UPDATE public.invoices SET ${sets}, updated_at = NOW()
       WHERE id = $${INVOICE_FIELDS.length + 1} RETURNING *`,
      [...INVOICE_FIELDS.map((field) => payload[field]), id]
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
    return NextResponse.json({ invoice: normalizePgInvoice(rows[0]) });
  } catch (error) {
    if (validationError(error)) return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    console.error("[neon/invoices:patch]", error);
    return NextResponse.json({ error: "อัปเดตเอกสารไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสเอกสารไม่ถูกต้อง" }, { status: 400 });
    const result = await queryNeon(`DELETE FROM public.invoices WHERE id = $1`, [id]);
    if (!result.rowCount) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[neon/invoices:delete]", error);
    return NextResponse.json({ error: "ลบเอกสารไม่สำเร็จ" }, { status: 500 });
  }
}
