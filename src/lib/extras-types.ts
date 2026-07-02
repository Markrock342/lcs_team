import type { TeamRole, TaskStatus, ClientStatus, ProjectType, Profile, Client } from "./types";

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue";
export type ThemeMode = "dark" | "light";

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_title: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user?: Profile | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface Invoice {
  id: string;
  client_id: string;
  title: string;
  total_amount: number;
  status: InvoiceStatus;
  due_date: string | null;
  notes: string | null;
  document_type?: "invoice" | "receipt" | "proposal";
  doc_number?: string | null;
  issue_date?: string | null;
  payment_method?: string | null;
  amount_in_words?: string | null;
  vat_amount?: number | null;
  line_items?: {
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[] | null;
  document_meta?: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
  payments?: InvoicePayment[];
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  created_at: string;
}

export interface TeamPayout {
  id: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  description: string;
  paid_at: string;
  slip_url: string | null;
  slip_file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  payer?: Profile | null;
  payee?: Profile | null;
}

export interface TeamFundContribution {
  id: string;
  contributor_id: string;
  amount: number;
  description: string;
  paid_at: string;
  slip_url: string | null;
  slip_file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contributor?: Profile | null;
}

export type AccountingEntryType = "income" | "expense";

export interface AccountingCategory {
  id: string;
  slug: string;
  name: string;
  type: AccountingEntryType;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountingTransaction {
  id: string;
  type: AccountingEntryType;
  amount: number;
  transaction_date: string;
  category_id: string | null;
  description: string;
  member_id: string | null;
  client_id: string | null;
  source_type: string | null;
  source_id: string | null;
  vat_amount: number;
  slip_url: string | null;
  slip_file_name: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  category?: AccountingCategory | null;
  member?: Profile | null;
  client?: Client | null;
  updater?: Profile | null;
}

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  note: string | null;
  created_at: string;
  user?: Profile | null;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  project_type: ProjectType | null;
  created_by: string | null;
  created_at: string;
  items?: TaskTemplateItem[];
}

export interface TaskTemplateItem {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  suggested_role: TeamRole | null;
  duration_days: number;
  sort_order: number;
}

export interface ClientFile {
  id: string;
  client_id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface PortalComment {
  author_name: string;
  content: string;
  task_id: string | null;
  created_at: string;
}

export interface PortalTaskFeedback {
  task_id: string;
  author_name: string;
  status: "approved" | "changes_requested" | "comment";
  comment: string | null;
  created_at: string;
}

export type ClientTimelineItem = {
  id: string;
  type: "activity" | "task" | "invoice" | "file" | "portal";
  title: string;
  subtitle?: string;
  date: string;
  link?: string;
};

// Re-import for extended Client
export interface ClientExtended extends Client {
  portal_token: string | null;
  portal_enabled: boolean;
}

export interface ProfileExtended extends Profile {
  theme: ThemeMode;
  push_enabled: boolean;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  partial: "จ่ายบางส่วน",
  paid: "จ่ายครบ",
  overdue: "เลยกำหนด",
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300",
  sent: "bg-[#00a3ff]/20 text-[#00a3ff]",
  partial: "bg-amber-500/20 text-amber-300",
  paid: "bg-emerald-500/20 text-emerald-300",
  overdue: "bg-red-500/20 text-red-400",
};

export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: "สร้าง",
  update: "แก้ไข",
  delete: "ลบ",
  assign: "มอบหมาย",
  complete: "เสร็จสิ้น",
  comment: "แสดงความคิดเห็น",
  upload: "อัปโหลด",
  payment: "รับชำระ",
};
