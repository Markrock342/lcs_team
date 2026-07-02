"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Download,
  FileText,
  Paperclip,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FilterTabs, RowMenu } from "@/components/mobile-ui";
import { Modal } from "@/components/ui";
import { SlipPreviewModal } from "@/components/SlipPreviewModal";
import { AccessDenied } from "@/components/AccessDenied";
import { useRole } from "@/components/RoleProvider";
import { QuickIncomeForm } from "@/components/QuickIncomeForm";
import {
  QuickPayoutForm,
  type QuickPayoutFormData,
} from "@/components/QuickPayoutForm";
import {
  QuickFundForm,
  type QuickFundFormData,
} from "@/components/QuickFundForm";
import {
  AccountingEntryForm,
  type AccountingEntryFormData,
} from "@/components/AccountingEntryForm";
import {
  DEFAULT_EXPENSE_CATEGORY,
  DEFAULT_INCOME_CATEGORY,
  accountingTransactionToEntry,
  filterAccountingByPeriod,
  summarizeAccounting,
} from "@/lib/finance";
import { mergeProfileBank } from "@/lib/team-banks";
import { exportToCSV, logActivity } from "@/lib/activity";
import { sendNotification } from "@/lib/notifications";
import { uploadFile } from "@/lib/upload";
import {
  saveAccountingTransaction,
  softDeleteAccountingTransaction,
  syncTeamFundContributionToLedger,
  syncTeamPayoutToLedger,
  updateAccountingTransaction,
} from "@/lib/accounting";
import { exportAccountingReportPdf } from "@/lib/export-pdf";
import type {
  AccountingCategory,
  AccountingEntryType,
  AccountingTransaction,
} from "@/lib/extras-types";
import type { Client, Profile } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyPayoutForm(): QuickPayoutFormData {
  return {
    payee_id: "",
    amount: "",
    description: "",
    paid_at: todayIso(),
    notes: "",
  };
}

function emptyFundForm(): QuickFundFormData {
  return {
    contributor_id: "",
    amount: "",
    description: "เก็บเงินกองกลาง",
    paid_at: todayIso(),
    notes: "",
  };
}

function emptyEntryForm(
  type: AccountingEntryType,
  categorySlug: string
): AccountingEntryFormData {
  return {
    type,
    amount: "",
    transaction_date: todayIso(),
    category_slug: categorySlug,
    description: "",
    member_id: "",
    client_id: "",
    vat_amount: "",
    notes: "",
  };
}

function transactionToForm(t: AccountingTransaction): AccountingEntryFormData {
  return {
    type: t.type,
    amount: String(t.amount),
    transaction_date: t.transaction_date,
    category_slug: t.category?.slug ?? DEFAULT_EXPENSE_CATEGORY,
    description: t.description,
    member_id: t.member_id ?? "",
    client_id: t.client_id ?? "",
    vat_amount: String(t.vat_amount ?? 0),
    notes: t.notes ?? "",
  };
}

function periodLabel(period: string) {
  if (period === "month") {
    return format(new Date(), "MMMM yyyy", { locale: th });
  }
  if (period === "year") {
    return format(new Date(), "yyyy", { locale: th });
  }
  return "ทั้งหมด";
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy", { locale: th });
  } catch {
    return iso;
  }
}

function money(value: number) {
  return `฿${value.toLocaleString()}`;
}

function sourceLabel(sourceType: string | null) {
  if (sourceType === "invoice_payment") return "จากใบแจ้งหนี้";
  if (sourceType === "team_payout") return "จ่ายเพื่อน";
  if (sourceType === "team_fund_contribution") return "กองกลาง";
  return "รายการเอง";
}

export default function FinancePageInner() {
  const { canViewFinance } = useRole();
  const [transactions, setTransactions] = useState<AccountingTransaction[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");
  const [view, setView] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [payoutForm, setPayoutForm] = useState<QuickPayoutFormData>(() =>
    emptyPayoutForm()
  );
  const [fundForm, setFundForm] = useState<QuickFundFormData>(() =>
    emptyFundForm()
  );
  const [entryForm, setEntryForm] = useState<AccountingEntryFormData>(() =>
    emptyEntryForm("expense", DEFAULT_EXPENSE_CATEGORY)
  );
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [fundSlipFile, setFundSlipFile] = useState<File | null>(null);
  const [entrySlipFile, setEntrySlipFile] = useState<File | null>(null);
  const [editingTransaction, setEditingTransaction] =
    useState<AccountingTransaction | null>(null);
  const [slipPreview, setSlipPreview] = useState<{
    url: string;
    fileName?: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("pay") === "1") setPayoutOpen(true);
    if (searchParams.get("income") === "1") setIncomeOpen(true);
    if (searchParams.get("fund") === "1") setFundOpen(true);
  }, [searchParams]);

  function defaultCategoryForType(type: AccountingEntryType) {
    const preferred =
      type === "income" ? DEFAULT_INCOME_CATEGORY : DEFAULT_EXPENSE_CATEGORY;
    return (
      categories.find((c) => c.slug === preferred)?.slug ??
      categories.find((c) => c.type === type)?.slug ??
      preferred
    );
  }

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    const [ledgerRes, categoryRes, memRes, clientRes] = await Promise.all([
      supabase
        .from("accounting_transactions")
        .select(
          "*, category:accounting_categories(*), member:profiles!accounting_transactions_member_id_fkey(*), client:clients(*), updater:profiles!accounting_transactions_updated_by_fkey(*)"
        )
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("accounting_categories")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("clients").select("*").order("name"),
    ]);

    if (ledgerRes.error || categoryRes.error) {
      const msg = ledgerRes.error?.message ?? categoryRes.error?.message ?? "";
      setDbError(
        msg.includes("deleted_at")
          ? "รัน supabase/add-accounting-audit.sql ใน Supabase ก่อน"
          : msg.includes("relation") || msg.includes("column")
            ? "รัน supabase/add-accounting-ledger.sql ใน Supabase ก่อน"
            : msg
      );
    } else {
      setDbError("");
    }

    setTransactions((ledgerRes.data ?? []) as AccountingTransaction[]);
    setCategories((categoryRes.data ?? []) as AccountingCategory[]);
    setMembers((memRes.data ?? []).map(mergeProfileBank));
    setClients((clientRes.data ?? []) as Client[]);
    setLoading(false);
  }

  const periodTransactions = filterAccountingByPeriod(transactions, period);
  const summary = summarizeAccounting(periodTransactions);
  const sortedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
  const filteredTransactions = periodTransactions.filter((t) => {
    if (view === "income" && t.type !== "income") return false;
    if (view === "expense" && t.type !== "expense") return false;
    if (categoryFilter !== "all" && t.category_id !== categoryFilter) return false;
    if (memberFilter !== "all" && t.member_id !== memberFilter) return false;
    if (clientFilter !== "all" && t.client_id !== clientFilter) return false;
    return true;
  });

  function openManualEntry(type: AccountingEntryType = "expense") {
    setEditingTransaction(null);
    setEntryForm(emptyEntryForm(type, defaultCategoryForType(type)));
    setEntrySlipFile(null);
    setDbError("");
    setEntryOpen(true);
  }

  function openEditTransaction(transaction: AccountingTransaction) {
    setEditingTransaction(transaction);
    setEntryForm(transactionToForm(transaction));
    setEntrySlipFile(null);
    setDbError("");
    setEntryOpen(true);
  }

  async function deleteTransaction(transaction: AccountingTransaction) {
    const ok = window.confirm(
      `ลบรายการ "${transaction.description}"?\n\nเป็น soft delete — ยังเก็บประวัติไว้ในระบบ`
    );
    if (!ok) return;
    setDbError("");
    const result = await softDeleteAccountingTransaction(transaction.id);
    if (!result.ok) {
      setDbError(result.error);
      return;
    }
    load();
    void logActivity("delete", "accounting_transaction", transaction.id, transaction.description);
  }

  async function savePayout(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || saving) return;
    setSaving(true);
    setDbError("");

    const supabase = createClient();
    let slip_url: string | null = null;
    let slip_file_name: string | null = null;

    if (slipFile) {
      const uploaded = await uploadFile(slipFile, "payouts");
      if (!uploaded.ok) {
        setSaving(false);
        setDbError(uploaded.error);
        return;
      }
      slip_url = uploaded.url;
      slip_file_name = slipFile.name;
    }

    const amount = parseFloat(payoutForm.amount);
    const savedForm = { ...payoutForm };

    const { data: payout, error } = await supabase
      .from("team_payouts")
      .insert({
        payer_id: currentUserId,
        payee_id: payoutForm.payee_id,
        amount,
        description: payoutForm.description.trim(),
        paid_at: payoutForm.paid_at,
        slip_url,
        slip_file_name,
        notes: payoutForm.notes.trim() || null,
        created_by: currentUserId,
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setDbError(error.message);
      return;
    }
    if (!payout?.id) {
      setSaving(false);
      setDbError("บันทึกรายจ่ายแล้ว แต่ไม่พบเลขอ้างอิงรายการ");
      return;
    }

    const ledger = await syncTeamPayoutToLedger({
      payoutId: payout.id,
      payeeId: payoutForm.payee_id,
      amount,
      paidAt: payoutForm.paid_at,
      description: payoutForm.description.trim(),
      slipUrl: slip_url,
      slipFileName: slip_file_name,
      notes: payoutForm.notes,
      createdBy: currentUserId,
    });
    if (!ledger.ok) {
      setSaving(false);
      setPayoutOpen(false);
      setDbError(`บันทึกรายจ่ายแล้ว แต่ลงบัญชีไม่สำเร็จ: ${ledger.error}`);
      return;
    }

    setPayoutOpen(false);
    setPayoutForm(emptyPayoutForm());
    setSlipFile(null);
    setSaving(false);
    load();

    const payerName =
      members.find((m) => m.id === currentUserId)?.display_name ?? "ทีม";
    void logActivity("create", "payout", ledger.id, savedForm.description, {
      amount,
    });
    if (savedForm.payee_id !== currentUserId) {
      void sendNotification({
        userId: savedForm.payee_id,
        title: "💸 ได้รับเงินจากทีม",
        body: `${payerName} โอน ${money(amount)} — ${savedForm.description}`,
        link: "/finance",
        kind: "system",
      });
    }
  }

  async function saveFund(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || saving) return;
    setSaving(true);
    setDbError("");

    const supabase = createClient();
    let slip_url: string | null = null;
    let slip_file_name: string | null = null;

    if (fundSlipFile) {
      const uploaded = await uploadFile(fundSlipFile, "payouts");
      if (!uploaded.ok) {
        setSaving(false);
        setDbError(uploaded.error);
        return;
      }
      slip_url = uploaded.url;
      slip_file_name = fundSlipFile.name;
    }

    const amount = parseFloat(fundForm.amount);
    const savedForm = { ...fundForm };

    const { data: contribution, error } = await supabase
      .from("team_fund_contributions")
      .insert({
        contributor_id: fundForm.contributor_id,
        amount,
        description: fundForm.description.trim(),
        paid_at: fundForm.paid_at,
        slip_url,
        slip_file_name,
        notes: fundForm.notes.trim() || null,
        created_by: currentUserId,
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setDbError(error.message);
      return;
    }
    if (!contribution?.id) {
      setSaving(false);
      setDbError("บันทึกกองกลางแล้ว แต่ไม่พบเลขอ้างอิงรายการ");
      return;
    }

    const ledger = await syncTeamFundContributionToLedger({
      contributionId: contribution.id,
      contributorId: fundForm.contributor_id,
      amount,
      paidAt: fundForm.paid_at,
      description: fundForm.description.trim(),
      slipUrl: slip_url,
      slipFileName: slip_file_name,
      notes: fundForm.notes,
      createdBy: currentUserId,
    });
    if (!ledger.ok) {
      setSaving(false);
      setFundOpen(false);
      setDbError(`บันทึกกองกลางแล้ว แต่ลงบัญชีไม่สำเร็จ: ${ledger.error}`);
      return;
    }

    setFundOpen(false);
    setFundForm(emptyFundForm());
    setFundSlipFile(null);
    setSaving(false);
    load();

    void logActivity("create", "fund_contribution", ledger.id, savedForm.description, {
      amount,
      contributor_id: savedForm.contributor_id,
    });
  }

  async function saveManualEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || saving) return;
    setSaving(true);
    setDbError("");

    let slipUrl: string | null = null;
    let slipFileName: string | null = null;
    if (entrySlipFile) {
      const uploaded = await uploadFile(entrySlipFile, "accounting");
      if (!uploaded.ok) {
        setSaving(false);
        setDbError(uploaded.error);
        return;
      }
      slipUrl = uploaded.url;
      slipFileName = entrySlipFile.name;
    }

    const amount = parseFloat(entryForm.amount);
    const vatAmount = parseFloat(entryForm.vat_amount || "0") || 0;

    const ledger = editingTransaction
      ? await updateAccountingTransaction(editingTransaction.id, {
          type: entryForm.type,
          amount,
          transactionDate: entryForm.transaction_date,
          categorySlug: entryForm.category_slug,
          description: entryForm.description,
          memberId: entryForm.member_id || null,
          clientId: entryForm.client_id || null,
          vatAmount,
          slipUrl,
          slipFileName,
          keepSlipUrl: editingTransaction.slip_url,
          keepSlipFileName: editingTransaction.slip_file_name,
          notes: entryForm.notes,
        })
      : await saveAccountingTransaction({
          type: entryForm.type,
          amount,
          transactionDate: entryForm.transaction_date,
          categorySlug: entryForm.category_slug,
          description: entryForm.description,
          memberId: entryForm.member_id || null,
          clientId: entryForm.client_id || null,
          vatAmount,
          slipUrl,
          slipFileName,
          notes: entryForm.notes,
          createdBy: currentUserId,
        });

    if (!ledger.ok) {
      setSaving(false);
      setDbError(ledger.error);
      return;
    }

    setEntryOpen(false);
    setEditingTransaction(null);
    setEntrySlipFile(null);
    setEntryForm(emptyEntryForm("expense", defaultCategoryForType("expense")));
    setSaving(false);
    load();

    void logActivity(
      editingTransaction ? "update" : "create",
      "accounting_transaction",
      ledger.id,
      entryForm.description,
      {
        amount,
        type: entryForm.type,
        category: entryForm.category_slug,
      }
    );
  }

  function exportPdf() {
    exportAccountingReportPdf({
      periodLabel: periodLabel(period),
      summary,
      transactions: filteredTransactions,
    });
  }

  function exportCsv() {
    exportToCSV(
      "accounting.csv",
      ["ประเภท", "วันที่", "หมวด", "รายการ", "สมาชิก/ลูกค้า", "VAT", "จำนวนเงิน", "หมายเหตุ"],
      filteredTransactions.map((t) => [
        t.type === "income" ? "รายรับ" : "รายจ่าย",
        t.transaction_date,
        t.category?.name ?? "",
        t.description,
        t.client?.name ?? t.member?.display_name ?? "",
        String(t.vat_amount ?? 0),
        String(t.type === "income" ? t.amount : -t.amount),
        t.notes ?? "",
      ])
    );
  }

  if (!canViewFinance) {
    return <AccessDenied />;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-lg mx-auto lg:max-w-4xl">
      <PageHeader
        title="บัญชีทีม"
        description="Cashbook กลางสำหรับรับเงิน จ่ายเงิน กองกลาง และรายงาน VAT พื้นฐาน"
      />

      {dbError && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {dbError}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 text-center">
        <p className="text-xs text-muted">คงเหลือ{period === "month" ? "เดือนนี้" : ""}</p>
        <p
          className={`text-3xl font-bold mt-1 ${
            summary.net >= 0 ? "text-accent" : "text-rose-300"
          }`}
        >
          {money(summary.net)}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-left">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
            <p className="text-[11px] text-muted">เงินเข้า</p>
            <p className="text-sm font-bold text-emerald-300">{money(summary.income)}</p>
          </div>
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
            <p className="text-[11px] text-muted">เงินออก</p>
            <p className="text-sm font-bold text-rose-300">{money(summary.expense)}</p>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
            <p className="text-[11px] text-muted">กองกลางเข้า</p>
            <p className="text-sm font-bold text-amber-300">{money(summary.fund)}</p>
          </div>
          <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3">
            <p className="text-[11px] text-muted">VAT</p>
            <p className="text-sm font-bold text-sky-300">{money(summary.vat)}</p>
          </div>
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
        <button
          type="button"
          onClick={() => {
            setFundOpen(true);
            setDbError("");
          }}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 active:scale-[0.98] transition-all touch-manipulation"
        >
          <PiggyBank size={28} className="text-amber-300" />
          <span className="font-semibold text-sm">เก็บกองกลาง</span>
        </button>
        <button
          type="button"
          onClick={() => openManualEntry("expense")}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-accent/40 bg-accent/10 hover:bg-accent/15 active:scale-[0.98] transition-all touch-manipulation"
        >
          <Plus size={28} className="text-accent" />
          <span className="font-semibold text-sm">เพิ่มรายการเอง</span>
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
        <button
          type="button"
          onClick={exportPdf}
          className="col-span-2 flex items-center justify-between p-3 rounded-xl border border-border hover:border-accent/30 text-sm touch-manipulation"
        >
          Export PDF สรุปเดือน
          <FileText size={16} className="text-muted" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-card border border-border text-sm"
        >
          <option value="month">เดือนนี้</option>
          <option value="year">ปีนี้</option>
          <option value="all">ทั้งหมด</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-card border border-border text-sm"
        >
          <option value="all">ทุกหมวด</option>
          {sortedCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-card border border-border text-sm"
        >
          <option value="all">ทุกสมาชิก</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name}
            </option>
          ))}
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-card border border-border text-sm"
        >
          <option value="all">ทุกลูกค้า</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <FilterTabs
        active={view}
        onChange={setView}
        tabs={[
          { key: "all", label: "ทั้งหมด", count: periodTransactions.length },
          {
            key: "income",
            label: "รายรับ",
            count: periodTransactions.filter((t) => t.type === "income").length,
          },
          {
            key: "expense",
            label: "รายจ่าย",
            count: periodTransactions.filter((t) => t.type === "expense").length,
          },
        ]}
      />

      <div className="space-y-2">
        {filteredTransactions.map((transaction) => {
          const entry = accountingTransactionToEntry(transaction);
          const menuItems = [
            ...(transaction.slip_url
              ? [
                  {
                    label: "ดูสลิป",
                    icon: <Paperclip size={14} />,
                    onClick: () =>
                      setSlipPreview({
                        url: transaction.slip_url!,
                        fileName: transaction.slip_file_name,
                      }),
                  },
                ]
              : []),
            {
              label: "แก้ไข",
              icon: <Pencil size={14} />,
              onClick: () => openEditTransaction(transaction),
            },
            {
              label: "ลบ",
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => deleteTransaction(transaction),
            },
          ];
          return (
            <div
              key={transaction.id}
              className="flex items-center gap-3 bg-card border border-border rounded-xl p-3"
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  entry.type === "income"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {entry.type === "income" ? (
                  <ArrowDownLeft size={18} />
                ) : (
                  <ArrowUpRight size={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-medium text-sm truncate">{entry.title}</p>
                  <span className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-background text-muted shrink-0">
                    {sourceLabel(transaction.source_type)}
                  </span>
                  {transaction.slip_url && (
                    <button
                      type="button"
                      onClick={() =>
                        setSlipPreview({
                          url: transaction.slip_url!,
                          fileName: transaction.slip_file_name,
                        })
                      }
                      className="sm:hidden p-1 rounded-lg text-accent touch-manipulation"
                      aria-label="ดูสลิป"
                    >
                      <Paperclip size={14} />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted truncate">
                  {formatDate(entry.date)} · {entry.subtitle}
                  {transaction.slip_url ? " · มีสลิป" : ""}
                  {transaction.updater?.display_name
                    ? ` · แก้โดย ${transaction.updater.display_name}`
                    : ""}
                </p>
              </div>
              <p
                className={`font-bold text-sm shrink-0 ${
                  entry.type === "income" ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {entry.type === "income" ? "+" : "-"}
                {money(entry.amount)}
              </p>
              <RowMenu items={menuItems} />
            </div>
          );
        })}
        {filteredTransactions.length === 0 && (
          <p className="text-center text-muted py-10 text-sm">
            ยังไม่มีรายการบัญชีในตัวกรองนี้
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

      <Modal open={payoutOpen} onClose={() => {
          if (saving) return;
          setPayoutOpen(false);
          setDbError("");
        }} title="จ่ายเพื่อนในทีม">
        {dbError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">
            {dbError}
          </div>
        )}
        <QuickPayoutForm
          form={payoutForm}
          members={members}
          slipFile={slipFile}
          saving={saving}
          onChange={setPayoutForm}
          onSlipChange={setSlipFile}
          onSubmit={savePayout}
        />
      </Modal>

      <Modal open={fundOpen} onClose={() => {
          if (saving) return;
          setFundOpen(false);
          setDbError("");
        }} title="เก็บเงินกองกลาง">
        {dbError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">
            {dbError}
          </div>
        )}
        <QuickFundForm
          form={fundForm}
          members={members}
          slipFile={fundSlipFile}
          saving={saving}
          onChange={setFundForm}
          onSlipChange={setFundSlipFile}
          onSubmit={saveFund}
        />
      </Modal>

      <Modal open={entryOpen} onClose={() => {
          if (saving) return;
          setEntryOpen(false);
          setEditingTransaction(null);
          setDbError("");
        }} title={editingTransaction ? "แก้ไขรายการบัญชี" : "เพิ่มรายการบัญชี"}>
        {dbError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">
            {dbError}
          </div>
        )}
        <AccountingEntryForm
          form={entryForm}
          categories={categories}
          members={members}
          clients={clients}
          slipFile={entrySlipFile}
          saving={saving}
          editing={!!editingTransaction}
          existingSlipUrl={editingTransaction?.slip_url}
          existingSlipFileName={editingTransaction?.slip_file_name}
          onChange={setEntryForm}
          onSlipChange={setEntrySlipFile}
          onSubmit={saveManualEntry}
          defaultCategoryForType={defaultCategoryForType}
        />
      </Modal>

      <SlipPreviewModal
        open={!!slipPreview}
        url={slipPreview?.url ?? null}
        fileName={slipPreview?.fileName}
        onClose={() => setSlipPreview(null)}
      />
    </div>
  );
}
