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
import type { Invoice } from "@/lib/extras-types";
import { neonRequest } from "@/lib/neon/client";
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
  question: string,
  opts: { includeFinance: boolean; asker?: string; userId?: string }
) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const soonKey = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);

  const [taskData, clientData, salesData, invoiceData, notifRes, ledgerRes] =
    await Promise.all([
      neonRequest<{ tasks: Task[] }>("/api/neon/tasks", { cache: "no-store" }),
      neonRequest<{ clients: Client[] }>("/api/neon/clients", { cache: "no-store" }),
      neonRequest<{ deals: SalesDeal[]; prospects: SalesProspect[] }>("/api/neon/sales", { cache: "no-store" }),
      neonRequest<{ invoices: Invoice[] }>("/api/neon/invoices", { cache: "no-store" }),
      opts.userId
        ? neonRequest<{ notifications: Array<{ title: string }> }>(
            "/api/neon/notifications?unread=1&limit=8",
            { cache: "no-store" },
          )
        : Promise.resolve({ notifications: [] as Array<{ title: string }> }),
      opts.includeFinance
        ? neonRequest<{ transactions: AccountingTransaction[] }>("/api/neon/accounting", { cache: "no-store" })
        : Promise.resolve({ transactions: [] as AccountingTransaction[] }),
    ]);

  const tasks = taskData.tasks.slice(0, 120) as Array<
    Pick<Task, "id" | "title" | "status" | "priority" | "due_date"> & {
      client: { name: string } | { name: string }[] | null;
    }
  >;
  const clients = clientData.clients.slice(0, 80) as Pick<Client, "id" | "name" | "status">[];
  const deals = salesData.deals.slice(0, 80) as Array<
    Pick<SalesDeal, "id" | "title" | "stage" | "value" | "next_follow_up"> & {
      client: { name: string } | { name: string }[] | null;
    }
  >;
  const prospects = salesData.prospects.slice(0, 80) as Pick<
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
    `ดีลในชุดข้อมูล ${deals.length} · ยังเปิด ${openDeals.length}`,
    `ท่อขาย: ${tally(deals.map((deal) => deal.stage as SalesStage), SALES_STAGE_LABELS)}`,
    followDeals.length
      ? `ดีลที่ต้องตามวันนี้: ${take(followDeals, 6).map((deal) => deal.title).join(" · ")}`
      : "ดีลที่ต้องตามวันนี้: ไม่มี",
    `เป้าหมาย ${prospects.length} · ${tally(prospects.map((row) => row.status as ProspectStatus), PROSPECT_STATUS_LABELS)}`,
    followProspects.length
      ? `เป้าหมายที่ต้องตามวันนี้: ${take(followProspects, 6).map((row) => row.name).join(" · ")}`
      : "เป้าหมายที่ต้องตามวันนี้: ไม่มี",
  ];

  if (opts.includeFinance) {
    const invoices = invoiceData.invoices.slice(0, 80);
    const outstanding = computeOutstandingReceivables(invoices);
    const month = summarizeAccounting(
      filterAccountingByPeriod(ledgerRes.transactions.slice(0, 80), "month")
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

  const unread = notifRes.notifications as Array<{ title: string | null }>;
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
