import type { TeamRole } from "./types";

export type Permission =
  | "manage_team"
  | "manage_clients"
  | "manage_tasks"
  | "manage_invoices"
  | "manage_templates"
  | "export_data"
  | "view_finance";

export const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  admin: [
    "manage_team",
    "manage_clients",
    "manage_tasks",
    "manage_invoices",
    "manage_templates",
    "export_data",
    "view_finance",
  ],
  pm: [
    "manage_clients",
    "manage_tasks",
    "manage_invoices",
    "manage_templates",
    "export_data",
    "view_finance",
  ],
  backend: ["manage_tasks", "view_finance"],
  design: ["manage_tasks", "view_finance"],
  sale: [
    "manage_clients",
    "manage_invoices",
    "export_data",
    "view_finance",
  ],
  guest: [],
};

export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  admin: "แอดมิน — สิทธิ์ครบ รวมจัดการทีม ลูกค้า และงาน",
  pm: "PM — จัดการลูกค้า งาน ใบแจ้งหนี้ เทมเพลต",
  backend: "Backend — รับงาน dev/API ที่มอบหมาย",
  design: "Design/Frontend — รับงาน UI/UX ที่มอบหมาย",
  sale: "Sale — ลีด ดีล ใบเสนอราคา และลูกค้า",
  guest: "Guest — ดูได้อย่างเดียว + แชท ไม่เห็นการเงินทีม",
};

/** Role ที่ admin กำหนดให้สมาชิกได้ */
export const ASSIGNABLE_ROLES: TeamRole[] = [
  "admin",
  "pm",
  "backend",
  "design",
  "sale",
  "guest",
];

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isAdmin(role: TeamRole): boolean {
  return role === "admin";
}

export function isGuest(role: TeamRole | null | undefined): boolean {
  return role === "guest";
}

/** สมาชิกทีม (ไม่ใช่ guest) — สร้าง/แก้ไข/ลบเนื้อหางานได้ */
export function canEdit(role: TeamRole | null | undefined): boolean {
  return !!role && role !== "guest";
}

/** เห็นข้อมูลการเงินทีม (finance / payouts) ได้ไหม */
export function canViewFinance(role: TeamRole | null | undefined): boolean {
  return !!role && hasPermission(role, "view_finance");
}
