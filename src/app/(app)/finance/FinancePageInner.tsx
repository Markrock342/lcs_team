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
import { PageShell, PageHeader, FilterTabs, RowMenu } from "@/components/mobile-ui";
import { SavedViewsBar } from "@/components/workspace/SavedViewsBar";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ListRow,
  MetricTile,
  Modal,
  PageLoader,
  StatusStamp,
} from "@/components/ui";
import { SlipPreviewModal } from "@/components/SlipPreviewModal";
import { AccessDenied } from "@/components/AccessDenied";
import { useRole } from "@/components/RoleProvider";
import { useActionFeedback } from "@/components/workspace/ActionFeedback";
import { formatBaht } from "@/lib/money";
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
  return formatBaht(value);
}

function sourceLabel(sourceType: string | null) {
  if (sourceType === "invoice_payment") return "จากใบแจ้งหนี้";
  if (sourceType === "team_payout") return "จ่ายเพื่อน";
  if (sourceType === "team_fund_contribution") return "กองกลาง";
  return "รายการเอง";
}

export default function FinancePageInner() {
  const { canViewFinance } = useRole();
  const { confirm } = useActionFeedback();
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
    if (!canViewFinance) {
      setLoading(false);
      return;
    }
    load();
  }, [canViewFinance]);

  useEffect(() => {
    // URL actions intentionally open a modal after client-side navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const ok = await confirm({
      title: "ลบรายการ",
      message: `ลบรายการ “${transaction.description}” หรือไม่?\nยังเก็บประวัติไว้ในระบบ`,
      confirmLabel: "ลบ",
      danger: true,
    });
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
    return (
      <AccessDenied
        title="ไม่มีสิทธิ์เข้าการเงิน"
        message="หน้านี้จำกัดเฉพาะแอดมินและแผนกบัญชี — สลิปและยอดเงินดูได้ที่นี่เท่านั้น"
      />
    );
  }

  if (loading) {
    return <PageLoader label="กำลังโหลดบัญชี..." />;
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="บัญชีทีม"
        description="สรุปเงินเข้า เงินออก กองกลาง และ VAT"
      />

      <SavedViewsBar
        page="finance"
        filters={{ view, period }}
        onApply={(filters) => {
          if (filters.tab === "receivable" || filters.view === "receivable") setView("income");
          if (filters.view && filters.view !== "receivable") setView(filters.view);
          if (filters.period) setPeriod(filters.period);
        }}
      />

      {dbError && <ErrorState title="เกิดข้อผิดพลาดด้านบัญชี" description={dbError} onRetry={load} />}

      <Card>
        <CardHeader
          title={`ยอดรวม · ${periodLabel(period)}`}
          description="ยอดตามช่วงเวลาที่เลือก"
          icon={<FileText size={18} />}
        />
        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-5">
          <MetricTile
            label="คงเหลือ"
            value={<span className={summary.net >= 0 ? "text-(--status-green-fg)" : "text-(--status-red-fg)"}>{money(summary.net)}</span>}
          />
          <MetricTile label="เงินเข้า" value={money(summary.income)} icon={<ArrowDownLeft size={18} />} />
          <MetricTile label="เงินออก" value={money(summary.expense)} icon={<ArrowUpRight size={18} />} />
          <MetricTile label="กองกลาง" value={money(summary.fund)} icon={<PiggyBank size={18} />} />
          <MetricTile label="VAT" value={money(summary.vat)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="บันทึกรายการ" description="เลือกประเภทที่ต้องการบันทึก" />
        <div className="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-4 lg:divide-y-0">
          <button type="button" onClick={() => setIncomeOpen(true)} className="flex min-h-20 items-center gap-3 px-4 py-3 text-left hover:bg-card-hover">
            <ArrowDownLeft size={20} className="text-(--status-green-fg)" />
            <span className="text-sm font-semibold">รับเงินลูกค้า</span>
          </button>
          <button type="button" onClick={() => { setPayoutOpen(true); setDbError(""); }} className="flex min-h-20 items-center gap-3 px-4 py-3 text-left hover:bg-card-hover">
            <ArrowUpRight size={20} className="text-(--status-red-fg)" />
            <span className="text-sm font-semibold">จ่ายเพื่อน</span>
          </button>
          <button type="button" onClick={() => { setFundOpen(true); setDbError(""); }} className="flex min-h-20 items-center gap-3 px-4 py-3 text-left hover:bg-card-hover">
            <PiggyBank size={20} className="text-(--status-amber-fg)" />
            <span className="text-sm font-semibold">เก็บกองกลาง</span>
          </button>
          <button type="button" onClick={() => openManualEntry("expense")} className="flex min-h-20 items-center gap-3 px-4 py-3 text-left hover:bg-card-hover">
            <Plus size={20} className="text-accent" />
            <span className="text-sm font-semibold">เพิ่มรายการ</span>
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="ตัวกรองและรายงาน"
          action={
            <div className="flex items-center gap-1">
              <Link href="/invoices" className="inline-flex min-h-10 items-center gap-1 px-2 text-sm font-medium text-accent hover:underline">
                เอกสาร <ChevronRight size={15} />
              </Link>
              <button type="button" onClick={exportCsv} className="min-h-10 p-2 text-muted hover:text-foreground" aria-label="ส่งออก CSV"><Download size={17} /></button>
              <button type="button" onClick={exportPdf} className="min-h-10 p-2 text-muted hover:text-foreground" aria-label="ส่งออก PDF"><FileText size={17} /></button>
            </div>
          }
        />
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="month">เดือนนี้</option><option value="year">ปีนี้</option><option value="all">ทั้งหมด</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="all">ทุกหมวด</option>
              {sortedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="all">ทุกสมาชิก</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
            </select>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="all">ทุกลูกค้า</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <FilterTabs
            active={view}
            onChange={setView}
            tabs={[
              { key: "all", label: "ทั้งหมด", count: periodTransactions.length },
              { key: "income", label: "รายรับ", count: periodTransactions.filter((t) => t.type === "income").length },
              { key: "expense", label: "รายจ่าย", count: periodTransactions.filter((t) => t.type === "expense").length },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="รายการบัญชี" description={`${filteredTransactions.length} รายการ`} />
        <div className="divide-y divide-border">
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
            <ListRow
              key={transaction.id}
              leading={
                <span className={`flex size-9 items-center justify-center rounded-xl ${entry.type === "income" ? "bg-(--status-green-bg) text-(--status-green-fg)" : "bg-(--status-red-bg) text-(--status-red-fg)"}`}>
                  {entry.type === "income" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </span>
              }
              title={
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{entry.title}</span>
                  <StatusStamp label={sourceLabel(transaction.source_type)} tone="slate" className="hidden sm:inline-flex" />
                  {transaction.slip_url && (
                    <button type="button" onClick={() => setSlipPreview({ url: transaction.slip_url!, fileName: transaction.slip_file_name })} className="p-1 text-accent sm:hidden" aria-label="ดูสลิป">
                      <Paperclip size={14} />
                    </button>
                  )}
                </div>
              }
              description={
                <span className="block truncate">
                  {formatDate(entry.date)} · {entry.subtitle}
                  {transaction.slip_url ? " · มีสลิป" : ""}
                  {transaction.updater?.display_name ? ` · แก้โดย ${transaction.updater.display_name}` : ""}
                </span>
              }
              trailing={
                <div className="flex items-center gap-2">
                  <span className={`text-right text-sm font-semibold tabular-nums ${entry.type === "income" ? "text-(--status-green-fg)" : "text-(--status-red-fg)"}`}>
                    {entry.type === "income" ? "+" : "-"}{money(entry.amount)}
                  </span>
                  <RowMenu items={menuItems} />
                </div>
              }
            />
          );
        })}
        {filteredTransactions.length === 0 && (
          <EmptyState icon={<FileText size={24} />} title="ไม่พบรายการ" description="ยังไม่มีรายการบัญชีตามตัวกรองนี้" />
        )}
        </div>
      </Card>

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
          <ErrorState title="บันทึกรายจ่ายไม่สำเร็จ" description={dbError} />
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
          <ErrorState title="บันทึกกองกลางไม่สำเร็จ" description={dbError} />
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
          <ErrorState title="บันทึกรายการไม่สำเร็จ" description={dbError} />
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
    </PageShell>
  );
}
