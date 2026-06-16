import type { TeamRole } from "./types";

export type Permission =
  | "manage_team"
  | "manage_clients"
  | "manage_tasks"
  | "manage_invoices"
  | "manage_templates"
  | "export_data";

export const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  admin: [
    "manage_team",
    "manage_clients",
    "manage_tasks",
    "manage_invoices",
    "manage_templates",
    "export_data",
  ],
  pm: [
    "manage_clients",
    "manage_tasks",
    "manage_invoices",
    "manage_templates",
    "export_data",
  ],
  backend: ["manage_tasks"],
  design: ["manage_tasks"],
};

export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  admin: "แอดมิน — จัดการทีม มอบหมาย role ควบคุมได้ทุกส่วน",
  pm: "PM — จัดการลูกค้า งาน ใบแจ้งหนี้ เทมเพลต",
  backend: "Backend — รับงาน dev/API ที่มอบหมาย",
  design: "Design/Frontend — รับงาน UI/UX ที่มอบหมาย",
};

export const ASSIGNABLE_ROLES: TeamRole[] = ["admin", "pm", "backend", "design"];

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isAdmin(role: TeamRole): boolean {
  return role === "admin";
}
