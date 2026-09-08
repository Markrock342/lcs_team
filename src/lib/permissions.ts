import type { Profile, TeamRole } from "./types";
import { getProfileDisplayRoles } from "./profile-display";

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
  ],
  accounting: ["manage_tasks", "export_data", "view_finance"],
  backend: ["manage_tasks"],
  design: ["manage_tasks"],
  sale: [
    "manage_clients",
    "manage_invoices",
    "export_data",
  ],
  guest: [],
};

export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  admin: "Admin — สิทธิ์ครบ รวมหน้าการเงินและจัดการทีม",
  pm: "PM — ลูกค้า งาน ใบแจ้งหนี้ เทมเพลต ไม่เห็นสลิปและยอดกองกลาง",
  accounting: "FN — แผนกบัญชี จัดการหน้าการเงิน สลิป และยอดเงิน",
  backend: "BE — รับงาน dev/API ที่มอบหมาย",
  design: "UI — รับงานออกแบบและ frontend ที่มอบหมาย",
  sale: "Sale — ลีด ดีล ใบเสนอราคา และลูกค้า",
  guest: "Guest — ดูได้อย่างเดียว + แชท ไม่เห็นการเงินทีม",
};

/** Role ที่ admin กำหนดให้สมาชิกได้ */
export const ASSIGNABLE_ROLES: TeamRole[] = [
  "admin",
  "pm",
  "accounting",
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

type FinanceActor =
  | TeamRole
  | Pick<Profile, "role" | "display_roles">
  | null
  | undefined;

/** หน้าการเงิน / สลิป / ยอดเงิน — เฉพาะแอดมิน หรือป้าย/สิทธิ์บัญชี (FN) */
export function canViewFinance(actor: FinanceActor): boolean {
  if (!actor) return false;
  if (typeof actor === "string") {
    return actor === "admin" || actor === "accounting";
  }
  if (actor.role === "admin" || actor.role === "accounting") return true;
  return getProfileDisplayRoles(actor).includes("accounting");
}
