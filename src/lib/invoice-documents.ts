import { bahtToText } from "./baht-text";

export type DocumentType = "invoice" | "receipt" | "proposal";

export type DocumentLineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type ScopeItem = { no: number; title: string; description: string };
export type WorkflowStep = {
  step: number;
  activity: string;
  deliverable: string;
};
export type MilestoneItem = {
  period: string;
  work: string;
  deliverable: string;
  percent: number;
  amount: number;
};
export type PaymentTerm = {
  label: string;
  percent: number;
  amount: number;
  condition: string;
};

export type ProposalMeta = {
  projectName: string;
  projectType: string;
  durationDays: number;
  scopeItems: ScopeItem[];
  workflowSteps: WorkflowStep[];
  milestones: MilestoneItem[];
  paymentTerms: PaymentTerm[];
  conditions: string[];
  totalAmount: number;
};

export type DocumentFormData = {
  document_type: DocumentType;
  client_id: string;
  title: string;
  doc_number: string;
  issue_date: string;
  status: string;
  due_date: string;
  payment_method: string;
  notes: string;
  vat_amount: string;
  line_items: DocumentLineItem[];
  document_meta: ProposalMeta | Record<string, unknown>;
};

export const LCS_COMPANY = {
  name: "Limit Code Studio",
  payee: "Limit Code Studio",
  bank: "กรุงไทย",
  accountNumber: "216-0-90996-3",
  accountName: "นาย สนธยา สายวรรณะ",
  signerName: "สนธยา สายวรรณะ",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: "ใบแจ้งหนี้",
  receipt: "ใบเสร็จรับเงิน",
  proposal: "Workflow / Proposal",
};

export const DOCUMENT_TYPE_TITLES: Record<DocumentType, { th: string; en: string }> = {
  invoice: { th: "ใบแจ้งหนี้", en: "INVOICE" },
  receipt: { th: "ใบเสร็จรับเงิน", en: "RECEIPT" },
  proposal: {
    th: "เอกสารสรุปขอบเขตงานและใบเสนอราคา",
    en: "PROJECT PROPOSAL & WORKFLOW",
  },
};

export function lineItemAmount(item: DocumentLineItem): number {
  return item.quantity * item.unitPrice;
}

export function sumLineItems(items: DocumentLineItem[]): number {
  return items.reduce((s, i) => s + lineItemAmount(i), 0);
}

export function formatMoney(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function generateDocNumber(type: DocumentType): string {
  const d = new Date();
  const ymd =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const prefix =
    type === "receipt" ? "LCS-RC" : type === "proposal" ? "LCS-PR" : "LCS-IV";
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `${prefix}-${ymd}-${seq}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeAmountInWords(total: number): string {
  return bahtToText(total);
}

export function emptyLineItem(): DocumentLineItem {
  return { description: "", quantity: 1, unit: "หน่วย", unitPrice: 0 };
}

export function emptyForm(type: DocumentType = "invoice"): DocumentFormData {
  return {
    document_type: type,
    client_id: "",
    title: "",
    doc_number: generateDocNumber(type),
    issue_date: todayISO(),
    status: type === "receipt" ? "paid" : "draft",
    due_date: "",
    payment_method: "โอนเงิน / เงินสด",
    notes:
      type === "receipt"
        ? "เอกสารนี้เป็นใบรับเงิน/ใบเสร็จรับเงิน ไม่ใช่ใบกำกับภาษี"
        : type === "invoice"
          ? "กรุณาชำระเงินภายในกำหนดตามเอกสาร"
          : "",
    vat_amount: "0",
    line_items: [emptyLineItem()],
    document_meta: {},
  };
}

/** Template: ใบเสร็จตามตัวอย่าง LCS */
export function receiptTemplate(): DocumentFormData {
  return {
    ...emptyForm("receipt"),
    title: "ค่าพัฒนาโปรแกรม",
    payment_method: "โอนเงิน / เงินสด",
    notes: "เอกสารนี้เป็นใบรับเงิน/ใบเสร็จรับเงิน ไม่ใช่ใบกำกับภาษี",
    line_items: [
      {
        description: "ค่าพัฒนาโปรแกรม",
        quantity: 1,
        unit: "หน่วย",
        unitPrice: 2600,
      },
    ],
  };
}

/** Template: ใบแจ้งหนี้ */
export function invoiceTemplate(): DocumentFormData {
  return {
    ...emptyForm("invoice"),
    title: "ค่าบริการพัฒนา",
    payment_method: "โอนเงิน",
    line_items: [
      {
        description: "ค่าบริการพัฒนา",
        quantity: 1,
        unit: "งวด",
        unitPrice: 0,
      },
    ],
  };
}

/** Template: Marketimes Asia Proposal & Workflow (จาก PDF) */
export function marketimesProposalTemplate(): DocumentFormData {
  const meta: ProposalMeta = {
    projectName: "โครงการพัฒนาเว็บไซต์ข่าว Marketimes Asia",
    projectType: "เว็บไซต์ข่าว / เว็บไซต์บทความธุรกิจ",
    durationDays: 14,
    totalAmount: 23000,
    scopeItems: [
      { no: 1, title: "ติดตั้งและตั้งค่าเว็บไซต์", description: "ติดตั้ง/ตั้งค่า WordPress พร้อมตั้งค่าเริ่มต้น" },
      { no: 2, title: "ตั้งค่าโดเมนใหม่", description: "เชื่อมต่อโดเมนใหม่กับเว็บไซต์" },
      { no: 3, title: "ออกแบบหน้าแรกสไตล์เว็บข่าวธุรกิจ", description: "จัดโครงหน้า Home ให้อ่านง่าย มีความน่าเชื่อถือ" },
      { no: 4, title: "ระบบ Headline 20 ข่าว", description: "หน้าแรกแสดงข่าว Headline ประมาณ 20 ข่าวล่าสุด" },
      { no: 5, title: "ปุ่มดูบทความทั้งหมด", description: "ปุ่มไปยังหน้ารวมบทความ เรียงตามวันที่เผยแพร่" },
      { no: 6, title: "หมวดข่าวหลัก", description: "Headline, Movement, Insight, People, Lifestyle" },
      { no: 7, title: "Guest Author", description: "แสดงชื่อผู้เขียนจริงโดยไม่ต้องสร้าง User แยกทุกคน" },
      { no: 8, title: "Related Posts", description: "แสดงข่าวที่เกี่ยวข้องท้ายบทความ" },
      { no: 9, title: "Banner Ads", description: "พื้นที่โฆษณา 3-5 ตำแหน่ง Top/Sidebar/In-article/Footer" },
      { no: 10, title: "SEO และ Performance เบื้องต้น", description: "Rank Math, Sitemap, OG, News Schema, Cache" },
      { no: 11, title: "สอนใช้งานหลังบ้าน", description: "สอนการลงข่าว หมวด/แท็ก รูป และผู้เขียน" },
    ],
    workflowSteps: [
      { step: 1, activity: "Kickoff และรับข้อมูล", deliverable: "ยืนยัน Scope, แบรนด์, โดเมน และตัวอย่างเว็บ" },
      { step: 2, activity: "วางโครงสร้างเว็บไซต์", deliverable: "โครงเมนู หมวดข่าว และแผนหน้า Home" },
      { step: 3, activity: "ออกแบบและขึ้นหน้าแรก", deliverable: "Preview Home, Headline, Sidebar, Ads" },
      { step: 4, activity: "พัฒนาฟังก์ชันหลัก", deliverable: "Guest Author, Related Posts, SEO" },
      { step: 5, activity: "ทดสอบและปรับแก้", deliverable: "Desktop/Mobile, ลิงก์, SEO, ความเร็ว" },
      { step: 6, activity: "ส่งมอบและสอนใช้งาน", deliverable: "เว็บพร้อมใช้ + คู่มือ + สอนหลังบ้าน" },
    ],
    milestones: [
      {
        period: "ก่อนเริ่มงาน",
        work: "มัดจำเริ่มโครงการ / Kickoff",
        deliverable: "ยืนยันเริ่มงานและเปิด Timeline",
        percent: 15,
        amount: 3450,
      },
      {
        period: "ประมาณวันที่ 5-7",
        work: "วางโครงเว็บ หน้าแรก และฟังก์ชันหลัก",
        deliverable: "Preview / Mockup หน้า Home และหมวดข่าว",
        percent: 45,
        amount: 10350,
      },
      {
        period: "ประมาณวันที่ 12-14",
        work: "เก็บงาน ทดสอบ SEO/Speed และสอนใช้งาน",
        deliverable: "Final / UAT / ส่งมอบเว็บพร้อมใช้งาน",
        percent: 40,
        amount: 9200,
      },
    ],
    paymentTerms: [
      { label: "งวดที่ 1: มัดจำเริ่มงาน", percent: 15, amount: 3450, condition: "ชำระก่อนเริ่มดำเนินงาน" },
      { label: "งวดที่ 2: หลังตรวจงานระหว่างทาง", percent: 45, amount: 10350, condition: "หลังเห็น Preview / Milestone 2" },
      { label: "งวดที่ 3: ส่งมอบงาน", percent: 40, amount: 9200, condition: "หลังตรวจ Final ก่อนส่งมอบ" },
    ],
    conditions: [
      "ราคาครอบคลุมเฉพาะ Scope ในเอกสาร — ฟีเจอร์เพิ่มอาจประเมินราคาใหม่",
      "ค่าโดเมน, Hosting, Theme/Plugin Premium ไม่รวมในราคา เว้นแต่ตกลงเป็นลายลักษณ์อักษร",
      "งวดที่ 2 และ 3 มี Preview ให้ตรวจก่อนชำระตาม Milestone",
    ],
  };

  return {
    ...emptyForm("proposal"),
    doc_number: "LCS-MTA-2026-001",
    title: meta.projectName,
    notes: "เอกสารนี้ใช้สำหรับการเสนอราคาและยืนยันขอบเขตงานเบื้องต้น",
    line_items: [
      {
        description: "พัฒนาเว็บไซต์ข่าว Marketimes Asia (ตาม Scope ในเอกสาร)",
        quantity: 1,
        unit: "โครงการ",
        unitPrice: 23000,
      },
    ],
    document_meta: meta,
  };
}

/** แปลงใบแจ้งหนี้ที่ชำระแล้ว → ข้อมูลใบเสร็จ */
export function buildReceiptFromInvoice(source: {
  id: string;
  client_id: string;
  title: string;
  doc_number?: string | null;
  payment_method?: string | null;
  vat_amount?: number | null;
  line_items?: DocumentLineItem[] | null;
  total_amount: number;
}): DocumentFormData {
  const line_items = source.line_items?.length
    ? source.line_items
    : [
        {
          description: source.title,
          quantity: 1,
          unit: "หน่วย",
          unitPrice: source.total_amount - (source.vat_amount ?? 0),
        },
      ];

  return {
    document_type: "receipt",
    client_id: source.client_id,
    title: source.title,
    doc_number: generateDocNumber("receipt"),
    issue_date: todayISO(),
    status: "paid",
    due_date: "",
    payment_method: source.payment_method || "โอนเงิน / เงินสด",
    notes: "เอกสารนี้เป็นใบรับเงิน/ใบเสร็จรับเงิน ไม่ใช่ใบกำกับภาษี",
    vat_amount: String(source.vat_amount ?? 0),
    line_items,
    document_meta: {
      source_invoice_id: source.id,
      source_doc_number: source.doc_number ?? "",
    },
  };
}

export function getReceiptSourceId(
  meta: Record<string, unknown> | null | undefined
): string | null {
  if (!meta || typeof meta !== "object") return null;
  const id = meta.source_invoice_id;
  return typeof id === "string" ? id : null;
}

export const DOCUMENT_TEMPLATES = [
  { id: "invoice", label: "ใบแจ้งหนี้ (ว่าง)", build: invoiceTemplate },
  { id: "receipt", label: "ใบเสร็จรับเงิน (ว่าง)", build: receiptTemplate },
  {
    id: "marketimes",
    label: "Marketimes Asia — Proposal & Workflow",
    build: marketimesProposalTemplate,
  },
] as const;
