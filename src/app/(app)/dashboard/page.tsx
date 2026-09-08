"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CheckSquare,
  ArrowRight,
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
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ListRow,
  MetricTile,
  PageLoader,
  ProfileRoleBadges,
  StatusBadge,
  StatusStamp,
} from "@/components/ui";
import { TaskCountdown } from "@/components/TaskCountdown";
import { PageHeader, PageShell, QuickActionGrid } from "@/components/mobile-ui";
import { SALES_STAGE_LABELS, TEAM } from "@/lib/constants";
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
  const [error, setError] = useState<string | null>(null);

  function money(value: number) {
    return `฿${value.toLocaleString()}`;
  }

  async function loadData() {
    const supabase = createClient();
    setError(null);

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

    const loadError =
      tasksRes.error ??
      clientsRes.error ??
      profilesRes.error ??
      ledgerRes.error ??
      invoicesRes.error;

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setTasks(tasksRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setTransactions((ledgerRes.data ?? []) as AccountingTransaction[]);
    setInvoices(invoicesRes.data ?? []);
    setDeals(
      (dealsRes.error ? [] : dealsRes.data ?? []).map((row) => ({
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

  const taskStatusMetrics = [
    { status: "pending" as const, value: pending.length },
    { status: "waiting" as const, value: waiting.length },
    { status: "in_progress" as const, value: inProgress.length },
    { status: "review" as const, value: tasks.filter((t) => t.status === "review").length },
    { status: "done" as const, value: tasks.filter((t) => t.status === "done").length },
  ];

  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");

  if (loading) {
    return <PageLoader label="กำลังเตรียมโต๊ะงาน..." />;
  }

  if (error) {
    return (
      <PageShell width="wide">
        <ErrorState
          description={error}
          onRetry={() => {
            setLoading(true);
            void loadData();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title={`สวัสดี ทีม ${TEAM.shortName}`}
        description="ภาพรวมงาน ลูกค้า การขาย และการเงิน พร้อมรายการที่ต้องลงมือทำต่อ"
      />

      <QuickActionGrid
        actions={[
          {
            href: "/today",
            label: "วันนี้",
            icon: <Calendar size={26} className="text-accent" />,
            className: "border-accent/35 bg-card hover:bg-card-hover",
          },
          {
            href: "/tasks",
            label: "ดูงาน",
            icon: <CheckSquare size={26} className="text-accent" />,
            className: "border-accent/35 bg-card hover:bg-card-hover",
          },
          {
            href: "/sales",
            label: "แผนกขาย",
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

      <Card>
        <CardHeader
          title="สถานะงานทั้งหมด"
          description={`${openTasks.length} งานที่ยังต้องดำเนินการ · ${activeClients.length} ลูกค้าที่กำลังดูแล`}
          icon={<CheckSquare size={18} className="text-accent" />}
          action={
            <Link href="/tasks" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
              ดูงาน <ArrowRight size={14} />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {taskStatusMetrics.map(({ status, value }) => (
            <Link
              key={status}
              href={`/tasks?status=${status}`}
              className="rounded-2xl transition-transform active:scale-[0.98]"
            >
              <MetricTile
                label=""
                value={value}
                icon={<StatusBadge status={status} />}
              />
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader
            title="งานที่ต้องทำ"
            description="เรียงจากงานที่เพิ่มล่าสุด"
            icon={<CheckSquare size={18} className="text-accent" />}
            action={
              <Link href="/tasks" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
                ดูทั้งหมด <ArrowRight size={14} />
              </Link>
            }
          />
          {openTasks.length > 0 ? (
            <div className="divide-y divide-border">
              {openTasks.slice(0, 5).map((task) => (
                <Link key={task.id} href="/tasks" className="block hover:bg-card-hover">
                  <ListRow
                    title={<span className="block truncate text-base">{task.title}</span>}
                    description={
                      <div className="space-y-1.5">
                        <p>{task.client?.name ?? "ไม่ระบุลูกค้า"}</p>
                        <TaskCountdown
                          startDate={task.start_date}
                          dueDate={task.due_date}
                          status={task.status}
                          size="sm"
                        />
                      </div>
                    }
                    trailing={<StatusBadge status={task.status} />}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckSquare size={28} />}
              title="ไม่มีงานค้าง"
              description="งานทั้งหมดเสร็จเรียบร้อยแล้ว"
              action={
                <Link href="/tasks" className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent">
                  <Plus size={16} /> เพิ่มงานใหม่
                </Link>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="งานขายที่ต้องตาม"
            description={`${openDeals.length} ดีลที่ยังเปิดอยู่`}
            icon={<Handshake size={18} className="text-emerald-300" />}
            action={
              <Link href="/sales" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
                ดูท่อขาย <ArrowRight size={14} />
              </Link>
            }
          />
          {openDeals.length > 0 ? (
            <div className="divide-y divide-border">
              {openDeals.slice(0, 4).map((deal) => (
                <Link key={deal.id} href="/sales" className="block hover:bg-card-hover">
                  <ListRow
                    title={<span className="block truncate text-base">{deal.title}</span>}
                    description={`${deal.client?.name ?? "ยังไม่ผูกลูกค้า"}${
                      deal.next_follow_up ? ` · นัด ${deal.next_follow_up}` : ""
                    }`}
                    trailing={<StatusStamp label={SALES_STAGE_LABELS[deal.stage]} />}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Handshake size={28} />}
              title="ยังไม่มีดีลที่กำลังคุย"
              description="เพิ่มดีลใหม่เพื่อเริ่มติดตามโอกาสการขาย"
              action={
                <Link href="/sales" className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent">
                  <Plus size={16} /> เพิ่มดีล
                </Link>
              }
            />
          )}
        </Card>
      </div>

      {canViewFinance && (
        <Card>
          <CardHeader
            title={`บัญชี ${monthLabel}`}
            description="สรุปกระแสเงินสดและยอดค้างรับของเดือนนี้"
            icon={<Wallet size={18} className="text-amber-300" />}
            action={
              <Link href="/finance" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
                ดูทั้งหมด <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
            <div className="grid grid-cols-2 gap-3">
              <MetricTile label="เงินเข้า" value={money(financeSummary.income)} icon={<ArrowDownLeft size={18} />} />
              <MetricTile label="เงินออก" value={money(financeSummary.expense)} icon={<ArrowUpRight size={18} />} />
              <MetricTile label="กองกลาง" value={money(financeSummary.fund)} icon={<PiggyBank size={18} />} />
              <MetricTile label="ค้างรับ" value={money(outstanding)} />
            </div>
            <div>
              <p className="mb-2 text-base font-semibold">รายจ่ายล่าสุด</p>
              {recentExpenses.length > 0 ? (
                <div className="divide-y divide-border">
                  {recentExpenses.map((t) => {
                    const entry = accountingTransactionToEntry(t);
                    return (
                      <Link key={t.id} href="/finance" className="block hover:bg-card-hover">
                        <ListRow
                          className="px-0"
                          title={<span className="block truncate text-base">{entry.title}</span>}
                          description={entry.subtitle}
                          trailing={<span className="font-semibold tabular-nums text-rose-300">-{money(entry.amount)}</span>}
                        />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-base text-muted">ยังไม่มีรายจ่ายเดือนนี้</p>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="ทีมงาน" icon={<Users size={18} className="text-violet-400" />} />
          <div className="divide-y divide-border">
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
                <ListRow
                  key={member.id}
                  leading={<Avatar name={member.display_name} src={member.avatar_url} size="sm" />}
                  title={
                    <div className="flex items-center gap-2">
                      <span className="truncate text-base">{member.display_name}</span>
                      <ProfileRoleBadges profile={member} size="xs" />
                    </div>
                  }
                  description={`${memberTasks.length} งานค้าง`}
                />
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="ลูกค้าล่าสุด"
            action={
              <Link href="/clients" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
                ดูทั้งหมด <ArrowRight size={14} />
              </Link>
            }
          />
          {clients.length > 0 ? (
            <div className="divide-y divide-border">
              {clients.slice(0, 4).map((c) => (
                <Link key={c.id} href="/clients" className="block hover:bg-card-hover">
                  <ListRow
                    title={<span className="block truncate text-base">{c.name}</span>}
                    description={c.contact_name}
                    trailing={<StatusStamp label={CLIENT_STATUS_LABELS[c.status]} />}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Users size={28} />}
              title="ยังไม่มีลูกค้า"
              description="เพิ่มลูกค้าเพื่อเชื่อมงานและเอกสารเข้าด้วยกัน"
              action={
                <Link href="/clients" className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent">
                  <Plus size={16} /> เพิ่มลูกค้า
                </Link>
              }
            />
          )}
        </Card>
      </div>

      <Card interactive>
        <Link href="/schedule" className="block">
          <ListRow
            leading={<Calendar size={22} className="text-accent" />}
            title={<span className="text-base">ตารางงาน</span>}
            description="ดูปฏิทิน วันเริ่ม และกำหนดส่ง"
            trailing={<ArrowRight size={18} className="text-muted" />}
          />
        </Link>
      </Card>
    </PageShell>
  );
}
