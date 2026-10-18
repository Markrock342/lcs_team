import { NextResponse } from "next/server";
import { requireNeonEditor } from "@/lib/neon/auth";
import { withNeonTransaction } from "@/lib/neon/server";
import { normalizePgInvoice, normalizePgPayment } from "@/lib/neon/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as Record<string, unknown>;
    const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
    const amount = Number(body.amount);
    const paidAt = typeof body.paid_at === "string" ? body.paid_at : "";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2_000) : null;
    const paymentMethod = typeof body.payment_method === "string" && body.payment_method.trim()
      ? body.payment_method.trim().slice(0, 500)
      : null;
    if (!UUID_RE.test(invoiceId) || !Number.isFinite(amount) || amount <= 0 || amount > 999_999_999_999 || !DATE_RE.test(paidAt)) {
      return NextResponse.json({ error: "ข้อมูลการชำระเงินไม่ถูกต้อง" }, { status: 400 });
    }

    const result = await withNeonTransaction(async (client) => {
      const invoiceResult = await client.query<{ total_amount: number }>(
        `SELECT total_amount::float8 AS total_amount FROM public.invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId]
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) return null;
      const paymentResult = await client.query(
        `INSERT INTO public.invoice_payments (invoice_id, amount, paid_at, note)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [invoiceId, amount, paidAt, note]
      );
      const totalResult = await client.query<{ paid: number }>(
        `SELECT COALESCE(sum(amount), 0)::float8 AS paid
         FROM public.invoice_payments WHERE invoice_id = $1`,
        [invoiceId]
      );
      const status = (totalResult.rows[0]?.paid ?? 0) >= invoice.total_amount ? "paid" : "partial";
      const updated = await client.query(
        `UPDATE public.invoices
         SET status = $1,
             payment_method = CASE WHEN $1 = 'paid' AND $2::text IS NOT NULL THEN $2 ELSE payment_method END,
             updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [status, paymentMethod, invoiceId]
      );
      return {
        payment: normalizePgPayment(paymentResult.rows[0]),
        invoice: normalizePgInvoice(updated.rows[0]),
        status,
      };
    });
    if (!result) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[neon/invoice-payments]", error);
    return NextResponse.json({ error: "บันทึกการชำระเงินไม่สำเร็จ" }, { status: 500 });
  }
}
