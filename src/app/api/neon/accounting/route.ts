import { NextResponse } from "next/server";
import { requireNeonPermission } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

function normalizeMoney<T extends Row>(row: T) {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
    vat_amount: row.vat_amount == null ? undefined : Number(row.vat_amount),
  };
}

function fail(error: unknown) {
  console.error("[neon/accounting]", error);
  return NextResponse.json({ error: "จัดการข้อมูลบัญชีไม่สำเร็จ" }, { status: 500 });
}

async function categoryId(slug: unknown) {
  if (typeof slug !== "string" || !slug) return null;
  const { rows } = await queryNeon<{ id: string }>(
    `SELECT id FROM public.accounting_categories WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return rows[0]?.id ?? null;
}

function transactionValues(data: Row, category: string | null) {
  const amount = Number(data.amount);
  const vat = Number(data.vat_amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(vat) || vat < 0) throw new Error("invalid amount");
  return [
    data.type,
    amount,
    data.transaction_date,
    category,
    data.description,
    data.member_id ?? null,
    data.client_id ?? null,
    data.source_type ?? null,
    data.source_id ?? null,
    vat,
    data.slip_url ?? null,
    data.slip_file_name ?? null,
    data.notes ?? null,
  ];
}

export async function GET() {
  try {
    const auth = await requireNeonPermission("view_finance");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const [transactions, categories, payouts, contributions] = await Promise.all([
      queryNeon(`SELECT a.*,
        CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END AS category,
        CASE WHEN m.id IS NULL THEN NULL ELSE to_jsonb(m) END AS member,
        CASE WHEN cl.id IS NULL THEN NULL ELSE to_jsonb(cl) END AS client,
        CASE WHEN u.id IS NULL THEN NULL ELSE to_jsonb(u) END AS updater
        FROM public.accounting_transactions a
        LEFT JOIN public.accounting_categories c ON c.id = a.category_id
        LEFT JOIN public.profiles m ON m.id = a.member_id
        LEFT JOIN public.clients cl ON cl.id = a.client_id
        LEFT JOIN public.profiles u ON u.id = a.updated_by
        WHERE a.deleted_at IS NULL
        ORDER BY a.transaction_date DESC, a.created_at DESC`),
      queryNeon(`SELECT * FROM public.accounting_categories ORDER BY sort_order, name`),
      queryNeon(`SELECT p.*,
        CASE WHEN payer.id IS NULL THEN NULL ELSE to_jsonb(payer) END AS payer,
        CASE WHEN payee.id IS NULL THEN NULL ELSE to_jsonb(payee) END AS payee
        FROM public.team_payouts p
        LEFT JOIN public.profiles payer ON payer.id = p.payer_id
        LEFT JOIN public.profiles payee ON payee.id = p.payee_id
        ORDER BY p.paid_at DESC, p.created_at DESC`),
      queryNeon(`SELECT f.*,
        CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS contributor
        FROM public.team_fund_contributions f
        LEFT JOIN public.profiles p ON p.id = f.contributor_id
        ORDER BY f.paid_at DESC, f.created_at DESC`),
    ]);
    return NextResponse.json({
      transactions: transactions.rows.map(normalizeMoney),
      categories: categories.rows,
      payouts: payouts.rows.map(normalizeMoney),
      contributions: contributions.rows.map(normalizeMoney),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonPermission("view_finance");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { resource?: unknown; data?: Row };
    const data = body.data ?? {};
    if (body.resource === "transaction") {
      const category = await categoryId(data.category_slug);
      if (!category) return NextResponse.json({ error: "ไม่พบหมวดบัญชี" }, { status: 400 });
      const values = transactionValues(data, category);
      const { rows } = await queryNeon(
        `INSERT INTO public.accounting_transactions
         (type, amount, transaction_date, category_id, description, member_id, client_id,
          source_type, source_id, vat_amount, slip_url, slip_file_name, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
         DO UPDATE SET type=EXCLUDED.type, amount=EXCLUDED.amount,
           transaction_date=EXCLUDED.transaction_date, category_id=EXCLUDED.category_id,
           description=EXCLUDED.description, member_id=EXCLUDED.member_id,
           client_id=EXCLUDED.client_id, vat_amount=EXCLUDED.vat_amount,
           slip_url=EXCLUDED.slip_url, slip_file_name=EXCLUDED.slip_file_name,
           notes=EXCLUDED.notes, updated_by=$14, updated_at=NOW()
         RETURNING *`,
        [...values, auth.context.userId]
      );
      return NextResponse.json({ row: normalizeMoney(rows[0]) }, { status: 201 });
    }
    if (body.resource === "payout") {
      const { rows } = await queryNeon(
        `INSERT INTO public.team_payouts
         (payer_id, payee_id, amount, description, paid_at, slip_url, slip_file_name, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [auth.context.userId, data.payee_id, data.amount, data.description, data.paid_at,
          data.slip_url ?? null, data.slip_file_name ?? null, data.notes ?? null, auth.context.userId]
      );
      return NextResponse.json({ row: normalizeMoney(rows[0]) }, { status: 201 });
    }
    if (body.resource === "fund") {
      const { rows } = await queryNeon(
        `INSERT INTO public.team_fund_contributions
         (contributor_id, amount, description, paid_at, slip_url, slip_file_name, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [data.contributor_id, data.amount, data.description, data.paid_at,
          data.slip_url ?? null, data.slip_file_name ?? null, data.notes ?? null, auth.context.userId]
      );
      return NextResponse.json({ row: normalizeMoney(rows[0]) }, { status: 201 });
    }
    return NextResponse.json({ error: "ประเภทข้อมูลไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireNeonPermission("view_finance");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown; data?: Row };
    if (typeof body.id !== "string" || !UUID_RE.test(body.id) || !body.data) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    const category = await categoryId(body.data.category_slug);
    if (!category) return NextResponse.json({ error: "ไม่พบหมวดบัญชี" }, { status: 400 });
    const amount = Number(body.data.amount);
    const vat = Number(body.data.vat_amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(vat) || vat < 0) {
      return NextResponse.json({ error: "จำนวนเงินไม่ถูกต้อง" }, { status: 400 });
    }
    const values = [
      body.data.type, amount, body.data.transaction_date, category, body.data.description,
      body.data.member_id ?? null, body.data.client_id ?? null, vat,
      body.data.slip_url ?? null, body.data.slip_file_name ?? null, body.data.notes ?? null,
    ];
    const { rows } = await queryNeon(
      `UPDATE public.accounting_transactions SET
       type=$1, amount=$2, transaction_date=$3, category_id=$4, description=$5,
       member_id=$6, client_id=$7, vat_amount=$8,
       slip_url=$9, slip_file_name=$10, notes=$11, updated_by=$12, updated_at=NOW()
       WHERE id=$13 AND deleted_at IS NULL RETURNING *`,
      [...values, auth.context.userId, body.id]
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบรายการบัญชี" }, { status: 404 });
    return NextResponse.json({ row: normalizeMoney(rows[0]) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonPermission("view_finance");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
    }
    const { rows } = await queryNeon(
      `UPDATE public.accounting_transactions
       SET deleted_at=NOW(), deleted_by=$1, updated_by=$1, updated_at=NOW()
       WHERE id=$2 AND deleted_at IS NULL RETURNING id`,
      [auth.context.userId, body.id]
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบรายการบัญชี" }, { status: 404 });
    return NextResponse.json({ ok: true, id: body.id });
  } catch (error) {
    return fail(error);
  }
}
