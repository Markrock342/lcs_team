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
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { neonRequest } from "@/lib/neon/client";
import { PageShell, PageHeader, FilterTabs } from "@/components/mobile-ui";
import { SavedViewsBar } from "@/components/workspace/SavedViewsBar";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
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

/** แสดงยอดติดลบเป็น -฿1,000 (ไม่ใช่ ฿-1,000) — withPlus ใส่ + หน้ายอดบวก */
function signedMoney(value: number, withPlus = false) {
  const sign = value < 0 ? "-" : withPlus && value > 0 ? "+" : "";
  return `${sign}${formatBaht(Math.abs(value))}`;
}

const PERIOD_OPTIONS = [
  { key: "month", label: "เดือนนี้" },
  { key: "year", label: "ปีนี้" },
  { key: "all", label: "ทั้งหมด" },
];

const ACTION_TONES = {
  green: "bg-(--status-green-bg) text-(--status-green-fg)",
  red: "bg-(--status-red-bg) text-(--status-red-fg)",
  amber: "bg-(--status-amber-bg) text-(--status-amber-fg)",
  blue: "bg-(--status-blue-bg) text-(--status-blue-fg)",
};

function ActionTile({
  label,
  hint,
  icon,
  tone,
  onClick,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: keyof typeof ACTION_TONES;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ticket-card flex min-h-24 flex-col items-start gap-2 p-4 text-left transition-colors hover:bg-card-hover active:scale-[0.99] touch-manipulation"
    >
      <span className={`flex size-10 items-center justify-center rounded-xl ${ACTION_TONES[tone]}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-snug">{label}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{hint}</span>
      </span>
    </button>
  );
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
  const [detail, setDetail] = useState<AccountingTransaction | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!canViewFinance) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

    const [accountingData, profileData, clientData] = await Promise.all([
      neonRequest<{ transactions: AccountingTransaction[]; categories: AccountingCategory[] }>(
        "/api/neon/accounting", { cache: "no-store" }
      ),
      neonRequest<{ profiles: Profile[] }>("/api/neon/profiles", { cache: "no-store" }),
      neonRequest<{ clients: Client[] }>("/api/neon/clients", { cache: "no-store" }),
    ]);
    setDbError("");
    setTransactions(accountingData.transactions ?? []);
    setCategories(accountingData.categories ?? []);
    setMembers((profileData.profiles ?? []).map(mergeProfileBank));
    setClients(clientData.clients ?? []);
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

    let payout: { id: string } | null = null;
    try {
      const result = await neonRequest<{ row: { id: string } }>("/api/neon/accounting", {
        method: "POST",
        body: JSON.stringify({ resource: "payout", data: {
        payee_id: payoutForm.payee_id,
        amount,
        description: payoutForm.description.trim(),
        paid_at: payoutForm.paid_at,
        slip_url,
        slip_file_name,
        notes: payoutForm.notes.trim() || null,
        } }),
      });
      payout = result.row;
    } catch (error) {
      setSaving(false);
      setDbError(error instanceof Error ? error.message : "บันทึกรายจ่ายไม่สำเร็จ");
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

    let contribution: { id: string } | null = null;
    try {
      const result = await neonRequest<{ row: { id: string } }>("/api/neon/accounting", {
        method: "POST",
        body: JSON.stringify({ resource: "fund", data: {
        contributor_id: fundForm.contributor_id,
        amount,
        description: fundForm.description.trim(),
        paid_at: fundForm.paid_at,
        slip_url,
        slip_file_name,
        notes: fundForm.notes.trim() || null,
        } }),
      });
      contribution = result.row;
    } catch (error) {
      setSaving(false);
      setDbError(error instanceof Error ? error.message : "บันทึกกองกลางไม่สำเร็จ");
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

  const sortedTransactions = [...filteredTransactions].sort((x, y) =>
    y.transaction_date.localeCompare(x.transaction_date)
  );
  const dayGroups: { date: string; items: AccountingTransaction[]; net: number }[] = [];
  for (const transaction of sortedTransactions) {
    const key = transaction.transaction_date.slice(0, 10);
    let group = dayGroups[dayGroups.length - 1];
    if (!group || group.date !== key) {
      group = { date: key, items: [], net: 0 };
      dayGroups.push(group);
    }
    group.items.push(transaction);
    group.net += transaction.type === "income" ? transaction.amount : -transaction.amount;
  }
  const flowTotal = summary.income + summary.expense;
  const incomeShare = flowTotal > 0 ? (summary.income / flowTotal) * 100 : 0;
  const activeFilterCount = [categoryFilter, memberFilter, clientFilter].filter(
    (value) => value !== "all"
  ).length;
  const selectClass =
    "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base";

  return (
    <PageShell width="wide">
      <PageHeader
        title="บัญชีทีม"
        description="เงินเข้า เงินออก และยอดคงเหลือของทีม"
      />

      {dbError && <ErrorState title="เกิดข้อผิดพลาดด้านบัญชี" description={dbError} onRetry={load} />}

      <Card>
        <div className="space-y-4 p-4 sm:p-5">
          <div
            role="group"
            aria-label="ช่วงเวลา"
            className="grid grid-cols-3 gap-1 rounded-xl bg-surface-soft p-1"
          >
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={period === option.key}
                onClick={() => setPeriod(option.key)}
                className={`min-h-11 rounded-lg px-2 text-[0.9375rem] font-medium transition-colors touch-manipulation ${
                  period === option.key
                    ? "bg-card text-foreground shadow-(--shadow-card)"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div>
            <p className="text-[0.9375rem] text-muted">ยอดคงเหลือ · {periodLabel(period)}</p>
            <p
              className={`mt-1 text-[2rem] font-semibold leading-tight tabular-nums wrap-anywhere sm:text-4xl ${
                summary.net >= 0 ? "text-(--status-green-fg)" : "text-(--status-red-fg)"
              }`}
            >
              {signedMoney(summary.net)}
            </p>
          </div>

          {flowTotal > 0 && (
            <div
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={`เงินเข้า ${Math.round(incomeShare)}% เงินออก ${100 - Math.round(incomeShare)}%`}
            >
              <span className="rounded-full bg-(--status-green-fg)" style={{ width: `${incomeShare}%` }} />
              <span className="flex-1 rounded-full bg-(--status-red-fg)" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-soft p-3.5">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <ArrowDownLeft size={16} className="text-(--status-green-fg)" /> เงินเข้า
              </p>
              <p className="mt-1 text-lg font-semibold leading-tight tabular-nums wrap-anywhere sm:text-xl">
                {money(summary.income)}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-soft p-3.5">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <ArrowUpRight size={16} className="text-(--status-red-fg)" /> เงินออก
              </p>
              <p className="mt-1 text-lg font-semibold leading-tight tabular-nums wrap-anywhere sm:text-xl">
                {money(summary.expense)}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-border border-t border-border text-[0.9375rem]">
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="flex items-center gap-2 text-muted">
                <PiggyBank size={16} /> กองกลาง
              </dt>
              <dd className="font-semibold tabular-nums">{signedMoney(summary.fund)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2.5">
              <dt className="flex items-center gap-2 text-muted">
                <FileText size={16} /> VAT รวม
              </dt>
              <dd className="font-semibold tabular-nums">{money(summary.vat)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <section aria-labelledby="finance-actions-title" className="space-y-3">
        <h2 id="finance-actions-title" className="text-base font-semibold">
          บันทึกรายการ
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ActionTile
            label="รับเงินลูกค้า"
            hint="เงินเข้า"
            tone="green"
            icon={<ArrowDownLeft size={20} />}
            onClick={() => setIncomeOpen(true)}
          />
          <ActionTile
            label="จ่ายเพื่อน"
            hint="เงินออก"
            tone="red"
            icon={<ArrowUpRight size={20} />}
            onClick={() => {
              setPayoutOpen(true);
              setDbError("");
            }}
          />
          <ActionTile
            label="เก็บกองกลาง"
            hint="เงินเข้า"
            tone="amber"
            icon={<PiggyBank size={20} />}
            onClick={() => {
              setFundOpen(true);
              setDbError("");
            }}
          />
          <ActionTile
            label="รายการอื่น"
            hint="เข้า / ออก"
            tone="blue"
            icon={<Plus size={20} />}
            onClick={() => openManualEntry("expense")}
          />
        </div>
      </section>

      <Card>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">รายการบัญชี</h2>
              <p className="text-sm text-muted">{filteredTransactions.length} รายการ</p>
            </div>
            <Link
              href="/invoices"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-medium text-accent hover:bg-card-hover"
            >
              เอกสาร <ChevronRight size={16} />
            </Link>
          </div>

          <FilterTabs
            active={view}
            onChange={setView}
            tabs={[
              { key: "all", label: "ทั้งหมด", count: periodTransactions.length },
              { key: "income", label: "เงินเข้า", count: periodTransactions.filter((t) => t.type === "income").length },
              { key: "expense", label: "เงินออก", count: periodTransactions.filter((t) => t.type === "expense").length },
            ]}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium touch-manipulation ${
                activeFilterCount > 0
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-card hover:bg-card-hover"
              }`}
            >
              <SlidersHorizontal size={16} />
              ตัวกรอง{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium hover:bg-card-hover touch-manipulation"
            >
              <Download size={16} /> CSV
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium hover:bg-card-hover touch-manipulation"
            >
              <FileText size={16} /> PDF
            </button>
          </div>

          {filtersOpen && (
            <div className="grid grid-cols-1 gap-3 rounded-2xl bg-surface-soft p-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-muted">หมวด</span>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectClass}>
                  <option value="all">ทุกหมวด</option>
                  {sortedCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-muted">สมาชิก</span>
                <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className={selectClass}>
                  <option value="all">ทุกสมาชิก</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.display_name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-muted">ลูกค้า</span>
                <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={selectClass}>
                  <option value="all">ทุกลูกค้า</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </label>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setMemberFilter("all");
                    setClientFilter("all");
                  }}
                  className="min-h-11 justify-self-start rounded-xl px-2 text-sm font-medium text-accent hover:bg-card-hover"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          )}

          <SavedViewsBar
            page="finance"
            filters={{ view, period }}
            onApply={(filters) => {
              if (filters.tab === "receivable" || filters.view === "receivable") setView("income");
              if (filters.view && filters.view !== "receivable") setView(filters.view);
              if (filters.period) setPeriod(filters.period);
            }}
          />
        </div>

        <div className="border-t border-border">
          {dayGroups.map((group) => (
            <section key={group.date} aria-label={formatDate(group.date)}>
              <div className="flex items-center justify-between gap-3 bg-surface-soft px-4 py-2 text-sm">
                <h3 className="font-semibold">{formatDate(group.date)}</h3>
                <span className="tabular-nums text-muted">
                  รวม {signedMoney(group.net, true)}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {group.items.map((transaction) => {
                  const entry = accountingTransactionToEntry(transaction);
                  const income = entry.type === "income";
                  return (
                    <li key={transaction.id}>
                      <button
                        type="button"
                        onClick={() => setDetail(transaction)}
                        className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-card-hover touch-manipulation"
                      >
                        <span
                          className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${
                            income
                              ? "bg-(--status-green-bg) text-(--status-green-fg)"
                              : "bg-(--status-red-bg) text-(--status-red-fg)"
                          }`}
                        >
                          {income ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0 text-base font-medium leading-snug line-clamp-2">
                              {entry.title}
                            </span>
                            <span
                              className={`shrink-0 text-base font-semibold tabular-nums ${
                                income ? "text-(--status-green-fg)" : "text-(--status-red-fg)"
                              }`}
                            >
                              <span className="sr-only">{income ? "เงินเข้า" : "เงินออก"} </span>
                              {income ? "+" : "-"}
                              {money(entry.amount)}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-sm leading-snug text-muted">
                            <span className="min-w-0 truncate">{entry.subtitle}</span>
                            {transaction.slip_url && <Paperclip size={14} className="shrink-0 text-accent" aria-label="มีสลิป" />}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {filteredTransactions.length === 0 && (
            <EmptyState icon={<FileText size={24} />} title="ไม่พบรายการ" description="ยังไม่มีรายการบัญชีตามตัวกรองนี้" />
          )}
        </div>
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="รายละเอียดรายการ">
        {detail && (
          <div className="space-y-5">
            <div>
              <StatusStamp
                label={detail.type === "income" ? "เงินเข้า" : "เงินออก"}
                tone={detail.type === "income" ? "green" : "red"}
              />
              <p
                className={`mt-2 text-[2rem] font-semibold leading-tight tabular-nums wrap-anywhere ${
                  detail.type === "income" ? "text-(--status-green-fg)" : "text-(--status-red-fg)"
                }`}
              >
                {detail.type === "income" ? "+" : "-"}
                {money(detail.amount)}
              </p>
              <p className="mt-1 text-base font-medium leading-snug">{detail.description}</p>
            </div>

            <dl className="divide-y divide-border rounded-2xl bg-surface-soft px-4 text-[0.9375rem]">
              {(
                [
                  ["วันที่", formatDate(detail.transaction_date)],
                  ["หมวด", detail.category?.name ?? "ไม่ระบุ"],
                  ["ที่มา", sourceLabel(detail.source_type)],
                  detail.client?.name ? ["ลูกค้า", detail.client.name] : null,
                  detail.member?.display_name ? ["สมาชิก", detail.member.display_name] : null,
                  detail.vat_amount ? ["VAT", money(detail.vat_amount)] : null,
                  detail.updater?.display_name ? ["แก้ไขล่าสุดโดย", detail.updater.display_name] : null,
                  detail.notes ? ["หมายเหตุ", detail.notes] : null,
                ].filter(Boolean) as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 py-3">
                  <dt className="shrink-0 text-muted">{label}</dt>
                  <dd className="min-w-0 text-right font-medium wrap-anywhere whitespace-pre-line">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="grid grid-cols-2 gap-2">
              {detail.slip_url && (
                <Button
                  type="button"
                  variant="secondary"
                  className="col-span-2"
                  onClick={() => {
                    setSlipPreview({ url: detail.slip_url!, fileName: detail.slip_file_name });
                    setDetail(null);
                  }}
                >
                  <Paperclip size={16} /> ดูสลิป / หลักฐาน
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const transaction = detail;
                  setDetail(null);
                  openEditTransaction(transaction);
                }}
              >
                <Pencil size={16} /> แก้ไข
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  const transaction = detail;
                  setDetail(null);
                  void deleteTransaction(transaction);
                }}
              >
                <Trash2 size={16} /> ลบ
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
