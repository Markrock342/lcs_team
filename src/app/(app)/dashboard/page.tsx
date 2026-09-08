"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CheckSquare,
  Clock,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  PiggyBank,
  Wallet,
  Handshake,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/RoleProvider";
import { StatusBadge, Avatar, ProfileRoleBadges } from "@/components/ui";
import { TaskCountdown } from "@/components/TaskCountdown";
import { PageHeader, QuickActionGrid } from "@/components/mobile-ui";
import { TEAM, SALES_STAGE_LABELS } from "@/lib/constants";
import { CLIENT_STATUS_LABELS } from "@/lib/constants";
import {
  accountingTransactionToEntry,
  computeOutstandingReceivables,
  filterAccountingByPeriod,
  summarizeAccounting,
} from "@/lib/finance";
import type { AccountingTransaction } from "@/lib/extras-types";
import type { Task, Client, Profile, SalesStage } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export default function DashboardPage() {
  const { canViewFinance } = useRole();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<AccountingTransaction[]>([]);
  const [invoices, setInvoices] = useState<
    Array<{
      status: string;
      total_amount: number;
      document_type?: string | null;
      payments?: { amount: number }[] | null;
    }>
  >([]);
  const [deals, setDeals] = useState<
    Array<{
      id: string;
      title: string;
      value: number | null;
      stage: SalesStage;
      next_follow_up: string | null;
      client: { name: string } | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  function money(value: number) {
    return `฿${value.toLocaleString()}`;
  }

  async function loadData() {
    const supabase = createClient();

    const [tasksRes, clientsRes, profilesRes, ledgerRes, invoicesRes, dealsRes] =
      await Promise.all([
      supabase
        .from("tasks")
        .select("*, client:clients(*), assignee:profiles!tasks_assigned_to_fkey(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase
        .from("accounting_transactions")
        .select(
          "*, category:accounting_categories(*), member:profiles!accounting_transactions_member_id_fkey(*), client:clients(*)"
        )
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("status, total_amount, document_type, payments:invoice_payments(amount)"),
      supabase
        .from("sales_deals")
        .select("id, title, value, stage, next_follow_up, client:clients(name)")
        .order("updated_at", { ascending: false }),
    ]);

    setTasks(tasksRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setTransactions((ledgerRes.data ?? []) as AccountingTransaction[]);
    setInvoices(invoicesRes.data ?? []);
    setDeals(
      (dealsRes.data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        value: row.value,
        stage: row.stage as SalesStage,
        next_follow_up: row.next_follow_up,
        client: Array.isArray(row.client) ? row.client[0] ?? null : row.client,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    // Updates happen only after the remote requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const pending = tasks.filter((t) => t.status === "pending");
  const waiting = tasks.filter((t) => t.status === "waiting");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const activeClients = clients.filter((c) => c.status === "active");
  const openTasks = tasks.filter((t) => t.status !== "done");
  const monthTransactions = filterAccountingByPeriod(transactions, "month");
  const financeSummary = summarizeAccounting(monthTransactions);
  const outstanding = computeOutstandingReceivables(invoices);
  const recentExpenses = monthTransactions
    .filter((t) => t.type === "expense")
    .slice(0, 4);
  const monthLabel = format(new Date(), "MMMM yyyy", { locale: th });

  const stats = [
    {
      label: "ลูกค้าที่ทำอยู่",
      value: activeClients.length,
      href: "/clients",
      icon: Users,
      card: "ticket-card hover:border-accent/35",
      iconBg: "bg-accent/15",
      iconColor: "text-accent",
      valueColor: "text-foreground",
    },
    {
      label: "งานกำลังทำ",
      value: inProgress.length,
      href: "/tasks?status=in_progress",
      icon: TrendingUp,
      card: "ticket-card hover:border-emerald-500/30",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-300",
      valueColor: "text-foreground",
    },
    {
      label: "รอดำเนินการ",
      value: waiting.length,
      href: "/tasks?status=waiting",
      icon: Clock,
      card: "ticket-card hover:border-amber-500/30",
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-300",
      valueColor: "text-foreground",
    },
    {
      label: "ยังไม่เริ่ม",
      value: pending.length,
      href: "/tasks?status=pending",
      icon: AlertTriangle,
      card: "ticket-card hover:border-rose-500/30",
      iconBg: "bg-rose-500/15",
      iconColor: "text-rose-300",
      valueColor: "text-foreground",
    },
  ];

  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto lg:max-w-4xl">
      <PageHeader
        title={`สวัสดี ทีม ${TEAM.shortName}`}
        description="เลือกงานจากใบสั่งด้านล่าง — ขาย งาน และการเงินอยู่ที่เดียวกัน"
      />

      <QuickActionGrid
        actions={[
          {
            href: "/tasks",
            label: "ดูงาน",
            icon: <CheckSquare size={26} className="text-accent" />,
            className: "border-accent/35 bg-card hover:bg-card-hover",
          },
          {
            href: "/sales",
            label: "งานขาย",
            icon: <Handshake size={26} className="text-emerald-300" />,
            className: "border-emerald-500/35 bg-card hover:bg-card-hover",
          },
          {
            href: "/finance?income=1",
            label: "รับเงิน",
            icon: <ArrowDownLeft size={26} className="text-sky-300" />,
            className: "border-sky-500/35 bg-card hover:bg-card-hover",
          },
          {
            href: "/clients",
            label: "ลูกค้า",
            icon: <Users size={26} className="text-muted" />,
            className: "border-border bg-card hover:bg-card-hover",
          },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`rounded-2xl p-4 transition-colors active:scale-[0.98] touch-manipulation ${s.card}`}
          >
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center mb-3`}>
              <s.icon className={s.iconColor} size={20} />
            </div>
            <p className={`text-2xl font-bold ${s.valueColor}`}>{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </Link>
        ))}
      </div>

      {canViewFinance && (
      <section className="ticket-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Wallet size={16} className="text-amber-300" />
            บัญชี {monthLabel}
          </h2>
          <Link href="/finance" className="text-xs text-accent flex items-center gap-1 touch-manipulation">
            ดูทั้งหมด <ArrowRight size={12} />
          </Link>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
              <p className="text-[11px] text-muted flex items-center gap-1">
                <ArrowDownLeft size={12} /> เงินเข้า
              </p>
              <p className="text-lg font-bold text-emerald-300">{money(financeSummary.income)}</p>
            </div>
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
              <p className="text-[11px] text-muted flex items-center gap-1">
                <ArrowUpRight size={12} /> เงินออก
              </p>
              <p className="text-lg font-bold text-rose-300">{money(financeSummary.expense)}</p>
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-[11px] text-muted flex items-center gap-1">
                <PiggyBank size={12} /> กองกลาง
              </p>
              <p className="text-lg font-bold text-amber-300">{money(financeSummary.fund)}</p>
            </div>
            <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3">
              <p className="text-[11px] text-muted">ค้างรับ</p>
              <p className="text-lg font-bold text-sky-300">{money(outstanding)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-2">รายจ่ายล่าสุด</p>
            <div className="space-y-1.5">
              {recentExpenses.map((t) => {
                const entry = accountingTransactionToEntry(t);
                return (
                  <Link
                    key={t.id}
                    href="/finance"
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-background border border-border hover:border-accent/30 touch-manipulation"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.title}</p>
                      <p className="text-[11px] text-muted truncate">{entry.subtitle}</p>
                    </div>
                    <span className="text-sm font-bold text-rose-300 shrink-0">
                      -{money(entry.amount)}
                    </span>
                  </Link>
                );
              })}
              {recentExpenses.length === 0 && (
                <p className="text-sm text-muted text-center py-3">ยังไม่มีรายจ่ายเดือนนี้</p>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      <section className="ticket-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Handshake size={16} className="text-emerald-300" />
            งานขายที่ต้องตาม
          </h2>
          <Link href="/sales" className="text-xs text-accent flex items-center gap-1 touch-manipulation">
            ดูท่อขาย <ArrowRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {openDeals.slice(0, 4).map((deal) => (
            <Link
              key={deal.id}
              href="/sales"
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-card-hover touch-manipulation"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{deal.title}</p>
                <p className="text-xs text-muted truncate">
                  {deal.client?.name ?? "ยังไม่ผูกลูกค้า"}
                  {deal.next_follow_up ? ` · นัด ${deal.next_follow_up}` : ""}
                </p>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted shrink-0">
                {SALES_STAGE_LABELS[deal.stage]}
              </span>
            </Link>
          ))}
          {openDeals.length === 0 && (
            <div className="px-4 py-8 text-center space-y-3">
              <p className="text-sm text-muted">ยังไม่มีดีลที่กำลังคุย</p>
              <Link href="/sales" className="inline-flex items-center gap-1 text-sm text-accent">
                <Plus size={14} /> เพิ่มดีล
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="ticket-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <CheckSquare size={16} className="text-accent" />
            งานที่ต้องทำ
          </h2>
          <Link href="/tasks" className="text-xs text-accent flex items-center gap-1 touch-manipulation">
            ดูทั้งหมด <ArrowRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {openTasks.slice(0, 5).map((task) => (
            <Link
              key={task.id}
              href="/tasks"
              className="block px-4 py-3 hover:bg-card-hover active:bg-card-hover transition-colors touch-manipulation"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{task.title}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {task.client?.name ?? "ไม่ระบุลูกค้า"}
                  </p>
                  <div className="mt-1.5">
                    <TaskCountdown
                      startDate={task.start_date}
                      dueDate={task.due_date}
                      status={task.status}
                      size="sm"
                    />
                  </div>
                </div>
                <StatusBadge status={task.status} />
              </div>
            </Link>
          ))}
          {openTasks.length === 0 && (
            <div className="px-4 py-8 text-center space-y-3">
              <p className="text-sm text-muted">ไม่มีงานค้าง 🎉</p>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-sm text-accent touch-manipulation"
              >
                <Plus size={14} /> เพิ่มงานใหม่
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="ticket-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users size={16} className="text-violet-400" />
              ทีมงาน
            </h2>
          </div>
          <div className="p-3 space-y-2">
            {(profiles.length > 0
              ? profiles
              : TEAM.members.map((m, i) => ({
                  id: String(i),
                  username: m.username,
                  display_name: m.displayName,
                  role: m.role,
                  display_roles: null,
                  avatar_url: null,
                  created_at: "",
                }))
            ).map((member) => {
              const memberTasks = tasks.filter(
                (t) => t.assigned_to === member.id && t.status !== "done"
              );
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-background border border-border"
                >
                  <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{member.display_name}</p>
                      <ProfileRoleBadges profile={member} size="xs" />
                    </div>
                    <p className="text-xs text-muted">{memberTasks.length} งานค้าง</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="ticket-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">ลูกค้าล่าสุด</h2>
            <Link href="/clients" className="text-xs text-accent flex items-center gap-1">
              ดูทั้งหมด <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {clients.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                href="/clients"
                className="flex items-center justify-between px-4 py-3 hover:bg-card-hover active:bg-card-hover touch-manipulation"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  {c.contact_name && (
                    <p className="text-xs text-muted truncate">{c.contact_name}</p>
                  )}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0 ml-2">
                  {CLIENT_STATUS_LABELS[c.status]}
                </span>
              </Link>
            ))}
            {clients.length === 0 && (
              <div className="px-4 py-8 text-center space-y-3">
                <p className="text-sm text-muted">ยังไม่มีลูกค้า</p>
                <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-accent">
                  <Plus size={14} /> เพิ่มลูกค้า
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>

      <Link
        href="/schedule"
        className="flex items-center justify-between p-4 rounded-2xl ticket-card hover:border-accent/30 active:bg-card-hover touch-manipulation"
      >
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-accent" />
          <div>
            <p className="font-medium text-sm">ตารางงาน</p>
            <p className="text-xs text-muted">ดูปฏิทินและ deadline</p>
          </div>
        </div>
        <ArrowRight size={16} className="text-muted" />
      </Link>
    </div>
  );
}
