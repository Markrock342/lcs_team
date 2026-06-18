"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FilterTabs } from "@/components/mobile-ui";
import { Modal } from "@/components/ui";
import { QuickIncomeForm } from "@/components/QuickIncomeForm";
import {
  QuickPayoutForm,
  type QuickPayoutFormData,
} from "@/components/QuickPayoutForm";
import {
  filterByPeriod,
  mergeFinanceEntries,
  sumByType,
  type FinanceEntry,
} from "@/lib/finance";
import { mergeProfileBank } from "@/lib/team-banks";
import { logActivity } from "@/lib/activity";
import { sendNotification } from "@/lib/notifications";
import { uploadFile } from "@/lib/upload";
import type { TeamPayout, Invoice, InvoicePayment } from "@/lib/extras-types";
import type { Client, Profile } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { exportToCSV } from "@/lib/activity";

const emptyPayout: QuickPayoutFormData = {
  payee_id: "",
  amount: "",
  description: "",
  paid_at: new Date().toISOString().slice(0, 10),
  notes: "",
};

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy", { locale: th });
  } catch {
    return iso;
  }
}

export default function FinancePageInner() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("all");
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutForm, setPayoutForm] = useState(emptyPayout);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("pay") === "1") setPayoutOpen(true);
    if (searchParams.get("income") === "1") setIncomeOpen(true);
  }, [searchParams]);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    const [payRes, payoutRes, memRes] = await Promise.all([
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
      supabase.from("profiles").select("*").order("display_name"),
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
    setMembers((memRes.data ?? []).map(mergeProfileBank));
    setLoading(false);
  }

  const monthEntries = filterByPeriod(entries, "month");
  const income = sumByType(monthEntries, "income");
  const expense = sumByType(monthEntries, "expense");
  const net = income - expense;

  const filtered = monthEntries.filter((e) => {
    if (view === "income") return e.type === "income";
    if (view === "expense") return e.type === "expense";
    return true;
  });

  async function savePayout(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) return;
    setSaving(true);
    setDbError("");

    const supabase = createClient();
    let slip_url: string | null = null;
    let slip_file_name: string | null = null;

    if (slipFile) {
      const uploaded = await uploadFile(slipFile, "payouts");
      if (!uploaded) {
        setSaving(false);
        setDbError("อัปโหลดสลิปไม่สำเร็จ");
        return;
      }
      slip_url = uploaded.url;
      slip_file_name = slipFile.name;
    }

    const amount = parseFloat(payoutForm.amount);

    const { error } = await supabase.from("team_payouts").insert({
      payer_id: currentUserId,
      payee_id: payoutForm.payee_id,
      amount,
      description: payoutForm.description.trim(),
      paid_at: payoutForm.paid_at,
      slip_url,
      slip_file_name,
      notes: payoutForm.notes.trim() || null,
      created_by: currentUserId,
    });

    setSaving(false);
    if (error) {
      setDbError(error.message);
      return;
    }

    const payerName =
      members.find((m) => m.id === currentUserId)?.display_name ?? "ทีม";
    await logActivity("create", "payout", null, payoutForm.description, { amount });
    if (payoutForm.payee_id !== currentUserId) {
      await sendNotification({
        userId: payoutForm.payee_id,
        title: "💸 ได้รับเงินจากทีม",
        body: `${payerName} โอน ฿${amount.toLocaleString()} — ${payoutForm.description}`,
        link: "/finance",
        kind: "system",
      });
    }

    setPayoutOpen(false);
    setPayoutForm(emptyPayout);
    setSlipFile(null);
    load();
  }

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
    <div className="space-y-5 animate-fade-in max-w-lg mx-auto lg:max-w-3xl">
      <PageHeader
        title="การเงิน"
        description="กด 2 ปุ่มด้านล่างเพื่อบันทึก — ไม่ต้องสลับหลายหน้า"
      />

      {dbError && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {dbError}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 text-center">
        <p className="text-xs text-muted">เดือนนี้ คงเหลือ</p>
        <p
          className={`text-3xl font-bold mt-1 ${net >= 0 ? "text-accent" : "text-rose-300"}`}
        >
          ฿{net.toLocaleString()}
        </p>
        <div className="flex justify-center gap-6 mt-3 text-sm">
          <span className="text-emerald-300">+฿{income.toLocaleString()}</span>
          <span className="text-rose-300">-฿{expense.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setIncomeOpen(true)}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 active:scale-[0.98] transition-all touch-manipulation"
        >
          <ArrowDownLeft size={28} className="text-emerald-300" />
          <span className="font-semibold text-sm">รับเงินลูกค้า</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setPayoutOpen(true);
            setDbError("");
          }}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15 active:scale-[0.98] transition-all touch-manipulation"
        >
          <ArrowUpRight size={28} className="text-rose-300" />
          <span className="font-semibold text-sm">จ่ายเพื่อน</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/invoices"
          className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-accent/30 text-sm touch-manipulation"
        >
          ใบแจ้งหนี้ / ใบเสร็จ
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-accent/30 text-sm touch-manipulation"
        >
          Export CSV
          <Download size={16} className="text-muted" />
        </button>
      </div>

      <FilterTabs
        active={view}
        onChange={setView}
        tabs={[
          { key: "all", label: "ทั้งหมด", count: monthEntries.length },
          {
            key: "income",
            label: "รายรับ",
            count: monthEntries.filter((e) => e.type === "income").length,
          },
          {
            key: "expense",
            label: "รายจ่าย",
            count: monthEntries.filter((e) => e.type === "expense").length,
          },
        ]}
      />

      <div className="space-y-2">
        {filtered.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 bg-card border border-border rounded-xl p-3"
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                e.type === "income"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              }`}
            >
              {e.type === "income" ? (
                <ArrowDownLeft size={18} />
              ) : (
                <ArrowUpRight size={18} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{e.title}</p>
              <p className="text-[11px] text-muted truncate">
                {formatDate(e.date)} · {e.subtitle}
              </p>
            </div>
            <p
              className={`font-bold text-sm shrink-0 ${
                e.type === "income" ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {e.type === "income" ? "+" : "-"}฿{e.amount.toLocaleString()}
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted py-10 text-sm">
            ยังไม่มีรายการเดือนนี้ — กดปุ่มด้านบนเพื่อบันทึก
          </p>
        )}
      </div>

      <Modal open={incomeOpen} onClose={() => setIncomeOpen(false)} title="รับเงินลูกค้า">
        <QuickIncomeForm
          onDone={() => {
            setIncomeOpen(false);
            load();
          }}
        />
      </Modal>

      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="จ่ายเพื่อนในทีม">
        {dbError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">
            {dbError}
          </div>
        )}
        <QuickPayoutForm
          form={payoutForm}
          members={members}
          currentUserId={currentUserId}
          slipFile={slipFile}
          saving={saving}
          onChange={setPayoutForm}
          onSlipChange={setSlipFile}
          onSubmit={savePayout}
        />
      </Modal>
    </div>
  );
}
