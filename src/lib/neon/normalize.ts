type PgRow = Record<string, unknown>;

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizePgClient<T extends PgRow>(row: T) {
  return {
    ...row,
    budget: row.budget == null ? null : numeric(row.budget),
  };
}

export function normalizePgInvoice<T extends PgRow>(row: T) {
  const payments = Array.isArray(row.payments)
    ? row.payments.map((payment) => {
        if (!payment || typeof payment !== "object" || Array.isArray(payment)) return payment;
        const record = payment as PgRow;
        return { ...record, amount: numeric(record.amount) };
      })
    : row.payments;

  return {
    ...row,
    total_amount: numeric(row.total_amount),
    vat_amount: row.vat_amount == null ? 0 : numeric(row.vat_amount),
    payments,
  };
}

export function normalizePgPayment<T extends PgRow>(row: T) {
  return { ...row, amount: numeric(row.amount) };
}
