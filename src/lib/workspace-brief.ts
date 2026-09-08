import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import {
  CLIENT_STATUS_LABELS,
  PROSPECT_STATUS_LABELS,
  SALES_STAGE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import {
  computeOutstandingReceivables,
  filterAccountingByPeriod,
  summarizeAccounting,
} from "@/lib/finance";
import type { AccountingTransaction } from "@/lib/extras-types";
import type {
  Client,
  ClientStatus,
  ProspectStatus,
  SalesDeal,
  SalesProspect,
  SalesStage,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

export const DEFAULT_BRIEF_QUESTION =
  "สรุปภาพรวมทั้งระบบตอนนี้ งานค้าง ดีลที่ต้องตาม และสิ่งที่ควรทำต่อ";

export const BRIEF_SYSTEM = `คุณเป็นผู้ช่วยสรุปโต๊ะงานของ Limit Code Studio
ใช้เฉพาะข้อมูลที่ให้มา ห้ามแต่งตัวเลขหรือรายการที่ไม่มีในข้อมูล
ตอบภาษาไทยธรรมชาติ กระชับ อ่านเร็ว เหมือนรายงานปฏิบัติการ ไม่ใช่สไลด์ขายของ
จัดเป็นหัวข้อสั้น ใช้บรรทัดใหม่ ไม่ใช้ตาราง
ถ้าข้อมูลไม่พอให้บอกตรงๆ ว่าขาดอะไร
ห้ามส่งข้อความแทนทีม และห้ามเปิดเผยรหัสผ่านหรือคีย์`;

function tally<T extends string>(values: T[], labels: Record<T, string>) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const label = labels[value] ?? value;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([label, count]) => `${label} ${count}`);
  return parts.length ? parts.join(" · ") : "ไม่มี";
}

function money(value: number) {
  return `฿${value.toLocaleString("th-TH")}`;
}

function take<T>(rows: T[], n: number) {
  return rows.slice(0, n);
}

export async function buildWorkspaceBriefPrompt(
  supabase: SupabaseClient,
  question: string,
  opts: { includeFinance: boolean; asker?: string; userId?: string }
) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const soonKey = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);

  const [tasksRes, clientsRes, dealsRes, prospectsRes, invoicesRes, notifRes, ledgerRes] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, client:clients(name)")
        .order("updated_at", { ascending: false })
        .limit(120),
      supabase
        .from("clients")
        .select("id, name, status")
        .order("updated_at", { ascending: false })
        .limit(80),
      supabase
        .from("sales_deals")
        .select("id, title, stage, value, next_follow_up, client:clients(name)")
        .order("updated_at", { ascending: false })
        .limit(80),
      supabase
        .from("sales_prospects")
        .select("id, name, status, next_follow_up")
        .order("updated_at", { ascending: false })
        .limit(80),
      supabase
        .from("invoices")
        .select("status, total_amount, document_type, due_date, title, payments:invoice_payments(amount)")
        .limit(80),
      opts.userId
        ? supabase
            .from("notifications")
            .select("title")
            .eq("user_id", opts.userId)
            .eq("read", false)
            .order("created_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [], error: null }),
      opts.includeFinance
        ? supabase
            .from("accounting_transactions")
            .select("*, category:accounting_categories(*)")
            .is("deleted_at", null)
            .order("transaction_date", { ascending: false })
            .limit(80)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const tasks = (tasksRes.data ?? []) as Array<
    Pick<Task, "id" | "title" | "status" | "priority" | "due_date"> & {
      client: { name: string } | { name: string }[] | null;
    }
  >;
  const clients = (clientsRes.data ?? []) as Pick<Client, "id" | "name" | "status">[];
  const deals = (dealsRes.error ? [] : dealsRes.data ?? []) as Array<
    Pick<SalesDeal, "id" | "title" | "stage" | "value" | "next_follow_up"> & {
      client: { name: string } | { name: string }[] | null;
    }
  >;
  const prospects = (prospectsRes.error ? [] : prospectsRes.data ?? []) as Pick<
    SalesProspect,
    "id" | "name" | "status" | "next_follow_up"
  >[];

  const clientName = (row: { client: { name: string } | { name: string }[] | null }) => {
    if (Array.isArray(row.client)) return row.client[0]?.name ?? "ไม่ระบุลูกค้า";
    return row.client?.name ?? "ไม่ระบุลูกค้า";
  };

  const openTasks = tasks.filter((task) => task.status !== "done");
  const overdue = openTasks.filter((task) => task.due_date && task.due_date < todayKey);
  const dueSoon = openTasks.filter(
    (task) => task.due_date && task.due_date >= todayKey && task.due_date <= soonKey
  );
  const urgent = openTasks.filter((task) => task.priority === "urgent" || task.priority === "high");
  const openDeals = deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost");
  const followDeals = openDeals.filter((deal) => deal.next_follow_up && deal.next_follow_up <= todayKey);
  const followProspects = prospects.filter(
    (row) =>
      row.next_follow_up &&
      row.next_follow_up <= todayKey &&
      row.status !== "converted" &&
      row.status !== "not_interested"
  );

  const lines = [
    `วันที่: ${format(today, "EEEE d MMMM yyyy", { locale: th })}`,
    opts.asker ? `ผู้ถาม: ${opts.asker}` : "",
    "",
    "## งาน",
    `ทั้งหมดในชุดข้อมูล ${tasks.length} · ยังไม่เสร็จ ${openTasks.length}`,
    `สถานะ: ${tally(tasks.map((task) => task.status as TaskStatus), TASK_STATUS_LABELS)}`,
    `ความสำคัญของงานค้าง: ${tally(openTasks.map((task) => task.priority as TaskPriority), TASK_PRIORITY_LABELS)}`,
    overdue.length
      ? `เลยกำหนด: ${take(overdue, 6).map((task) => `${task.title} (${task.due_date})`).join(" · ")}`
      : "เลยกำหนด: ไม่มี",
    dueSoon.length
      ? `ใกล้ครบ 3 วัน: ${take(dueSoon, 6).map((task) => `${task.title} (${task.due_date})`).join(" · ")}`
      : "ใกล้ครบ 3 วัน: ไม่มี",
    urgent.length
      ? `เร่ง/สูง: ${take(urgent, 6).map((task) => `${task.title} · ${clientName(task)}`).join(" · ")}`
      : "เร่ง/สูง: ไม่มี",
    "",
    "## ลูกค้า",
    `ทั้งหมด ${clients.length}`,
    `สถานะ: ${tally(clients.map((client) => client.status as ClientStatus), CLIENT_STATUS_LABELS)}`,
    clients.length
      ? `ล่าสุด: ${take(clients, 6).map((client) => client.name).join(" · ")}`
      : "ยังไม่มีลูกค้า",
    "",
    "## ขาย",
    dealsRes.error ? "ตารางดีลยังไม่พร้อมในโปรเจกต์นี้" : `ดีลในชุดข้อมูล ${deals.length} · ยังเปิด ${openDeals.length}`,
    dealsRes.error ? "" : `ท่อขาย: ${tally(deals.map((deal) => deal.stage as SalesStage), SALES_STAGE_LABELS)}`,
    followDeals.length
      ? `ดีลที่ต้องตามวันนี้: ${take(followDeals, 6).map((deal) => deal.title).join(" · ")}`
      : "ดีลที่ต้องตามวันนี้: ไม่มี",
    prospectsRes.error
      ? "ตารางเป้าหมายยังไม่พร้อมในโปรเจกต์นี้"
      : `เป้าหมาย ${prospects.length} · ${tally(prospects.map((row) => row.status as ProspectStatus), PROSPECT_STATUS_LABELS)}`,
    followProspects.length
      ? `เป้าหมายที่ต้องตามวันนี้: ${take(followProspects, 6).map((row) => row.name).join(" · ")}`
      : "เป้าหมายที่ต้องตามวันนี้: ไม่มี",
  ];

  if (opts.includeFinance) {
    const invoices = invoicesRes.data ?? [];
    const outstanding = computeOutstandingReceivables(invoices);
    const month = summarizeAccounting(
      filterAccountingByPeriod((ledgerRes.data ?? []) as AccountingTransaction[], "month")
    );
    const unpaid = invoices.filter(
      (inv) =>
        (inv.document_type ?? "invoice") !== "proposal" &&
        (inv.document_type ?? "invoice") !== "quotation" &&
        (inv.document_type ?? "invoice") !== "agreement" &&
        inv.status !== "paid" &&
        inv.status !== "draft"
    );
    lines.push(
      "",
      "## การเงินเดือนนี้",
      `เงินเข้า ${money(month.income)} · เงินออก ${money(month.expense)} · กองกลาง ${money(month.fund)}`,
      `ค้างรับประมาณ ${money(outstanding)} · เอกสารที่ยังไม่ปิด ${unpaid.length} ใบ`
    );
  } else {
    lines.push("", "## การเงิน", "ผู้ถามไม่มีสิทธิ์ดูการเงินทีม — ห้ามเดายอดเงิน");
  }

  const unread = (notifRes.data ?? []) as Array<{ title: string | null }>;
  lines.push(
    "",
    "## กล่องงาน",
    unread.length
      ? `ยังไม่อ่าน ${unread.length}+ · ${unread.map((row) => row.title ?? "การแจ้งเตือน").join(" · ")}`
      : "กล่องงานว่าง"
  );

  const snapshot = lines.filter((line) => line !== undefined).join("\n");

  return `คำถามจากทีม:
${question}

ข้อมูลโต๊ะงาน:
${snapshot}

ตอบคำถามด้านบนจากข้อมูลนี้เท่านั้น`;
}
