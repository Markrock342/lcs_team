"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FilterTabs } from "@/components/mobile-ui";
import { Button } from "@/components/ui";
import {
  filterByPeriod,
  mergeFinanceEntries,
  sumByType,
  type FinanceEntry,
} from "@/lib/finance";
import type { TeamPayout, Invoice, InvoicePayment } from "@/lib/extras-types";
import type { Client } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { exportToCSV } from "@/lib/activity";

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy", { locale: th });
  } catch {
    return iso;
  }
}

export default function FinancePage() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();

    const [payRes, payoutRes] = await Promise.all([
      supabase
        .from("invoice_payments")
        .select(
          "*, invoice:invoices(id, title, doc_number, document_type, client:clients(name))"
        )
        .order("paid_at", { ascending: false }),
      supabase
        .from("team_payouts")
        .select(
          "*, payer:profiles!team_payouts_payer_id_fkey(*), payee:profiles!team_payouts_payee_id_fkey(*)"
        )
        .order("paid_at", { ascending: false }),
    ]);

    if (payRes.error || payoutRes.error) {
      const msg = payRes.error?.message ?? payoutRes.error?.message ?? "";
      if (msg.includes("relation") || msg.includes("column")) {
        setDbError("รัน SQL migration ใน Supabase ก่อน");
      }
    }

    const payments = (payRes.data ?? []) as (InvoicePayment & {
      invoice?: (Invoice & { client?: Client | null }) | null;
    })[];
    const payouts = (payoutRes.data ?? []) as TeamPayout[];

    setEntries(mergeFinanceEntries(payments, payouts));
    setLoading(false);
  }

  const periodEntries = filterByPeriod(entries, period);
  const income = sumByType(periodEntries, "income");
  const expense = sumByType(periodEntries, "expense");
  const net = income - expense;

  const filtered = periodEntries.filter((e) =>
    typeFilter === "all" ? true : e.type === typeFilter
  );

  function exportCsv() {
    exportToCSV(
      "finance.csv",
      ["ประเภท", "วันที่", "รายการ", "รายละเอียด", "จำนวนเงิน"],
      filtered.map((e) => [
        e.type === "income" ? "รายรับ" : "รายจ่าย",
        e.date,
        e.title,
        e.subtitle,
        String(e.type === "income" ? e.amount : -e.amount),
      ])
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="การเงิน"
        description="รายรับจากลูกค้า · รายจ่ายจ้างทีม"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={16} /> Export
            </Button>
            <Link href="/payouts">
              <Button variant="secondary">จ่ายทีม</Button>
            </Link>
            <Link href="/invoices">
              <Button variant="secondary">ใบแจ้งหนี้</Button>
            </Link>
          </div>
        }
      />

      {dbError && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {dbError}
        </div>
      )}

      <FilterTabs
        active={period}
        onChange={setPeriod}
        tabs={[
          { key: "all", label: "ทั้งหมด" },
          { key: "month", label: "เดือนนี้" },
          { key: "year", label: "ปีนี้" },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-emerald-500/15 to-transparent border border-emerald-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-emerald-300 mb-2">
            <TrendingUp size={18} />
            <span className="text-xs font-medium">รายรับจากลูกค้า</span>
          </div>
          <p className="text-2xl font-bold text-emerald-300">
            ฿{income.toLocaleString()}
          </p>
        </div>
        <div className="bg-gradient-to-br from-rose-500/15 to-transparent border border-rose-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-rose-300 mb-2">
            <TrendingDown size={18} />
            <span className="text-xs font-medium">รายจ่ายจ้างทีม</span>
          </div>
          <p className="text-2xl font-bold text-rose-300">
            ฿{expense.toLocaleString()}
          </p>
        </div>
        <div className="bg-gradient-to-br from-accent/15 to-transparent border border-accent/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-accent mb-2">
            <Scale size={18} />
            <span className="text-xs font-medium">คงเหลือสุทธิ</span>
          </div>
          <p
            className={`text-2xl font-bold ${net >= 0 ? "text-accent" : "text-rose-300"}`}
          >
            ฿{net.toLocaleString()}
          </p>
        </div>
      </div>

      <FilterTabs
        active={typeFilter}
        onChange={setTypeFilter}
        tabs={[
          { key: "all", label: "ทั้งหมด", count: periodEntries.length },
          {
            key: "income",
            label: "รายรับ",
            count: periodEntries.filter((e) => e.type === "income").length,
          },
          {
            key: "expense",
            label: "รายจ่าย",
            count: periodEntries.filter((e) => e.type === "expense").length,
          },
        ]}
      />

      <div className="space-y-2">
        {filtered.map((e) => (
          <div
            key={e.id}
            className="bg-card border border-border rounded-2xl p-4 flex gap-3 items-start"
          >
            <div
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                e.type === "income"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              }`}
            >
              {e.type === "income" ? (
                <ArrowDownLeft size={20} />
              ) : (
                <ArrowUpRight size={20} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.title}</p>
                  <p className="text-xs text-muted mt-0.5">{e.subtitle}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {formatDate(e.date)}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                </div>
                <p
                  className={`font-bold shrink-0 ${
                    e.type === "income" ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {e.type === "income" ? "+" : "-"}฿{e.amount.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-3 mt-2">
                {e.slip_url && (
                  <a
                    href={e.slip_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> ดูสลิป
                  </a>
                )}
                {e.link && (
                  <Link
                    href={e.link}
                    className="text-xs text-muted hover:text-accent"
                  >
                    ไปที่หน้านั้น →
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted py-12">
            ยังไม่มีรายการ — บันทึกชำระที่「ใบแจ้งหนี้」หรือ「จ่ายทีม」
          </p>
        )}
      </div>
    </div>
  );
}
