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
  // Guest = อ่านอย่างเดียว: ดูงาน/ลูกค้าได้ แชทได้ แต่แก้ไข/ลบ/สร้างไม่ได้ และดูการเงินทีมไม่ได้
  guest: [],
};

export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  admin: "แอดมิน — สิทธิ์ครบทุกอย่าง รวม PM (จัดการทีม + ลูกค้า + งาน)",
  pm: "PM — จัดการลูกค้า งาน ใบแจ้งหนี้ เทมเพลต (ไม่มีจัดการทีม)",
  backend: "Backend — รับงาน dev/API ที่มอบหมาย",
  design: "Design/Frontend — รับงาน UI/UX ที่มอบหมาย",
  guest: "Guest — ดูได้อย่างเดียว + แชท (แก้ไข/ลบ/สร้างไม่ได้ · ไม่เห็นการเงินทีม)",
};

/** Role ที่ admin กำหนดให้สมาชิกได้ */
export const ASSIGNABLE_ROLES: TeamRole[] = [
  "admin",
  "pm",
  "backend",
  "design",
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
