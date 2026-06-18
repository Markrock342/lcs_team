import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Calendar,
  MessageCircle,
  CircleDollarSign,
  Receipt,
  LayoutTemplate,
  History,
  Settings,
  MoreHorizontal,
  Wallet,
  Bell,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** คำอธิบายสั้นๆ สำหรับหน้า More */
  desc?: string;
  color?: string;
};

/** เมนูหลัก — sidebar desktop + ใช้บ่อย */
export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/tasks", label: "งาน", icon: CheckSquare, desc: "งานใหญ่ · งานย่อย · Kanban" },
  { href: "/clients", label: "ลูกค้า", icon: Users, desc: "ข้อมูลลูกค้า · Portal" },
  { href: "/finance", label: "การเงิน", icon: CircleDollarSign, desc: "รับเงิน · จ่ายทีม · สรุป", color: "text-sky-400" },
  { href: "/chat", label: "แชททีม", icon: MessageCircle, desc: "แชทกลุ่มทีม" },
];

/** เมนูรอง — sidebar + More */
export const EXTRA_NAV: NavItem[] = [
  { href: "/schedule", label: "ตารางงาน", icon: Calendar, desc: "ปฏิทิน · Gantt", color: "text-accent" },
  { href: "/invoices", label: "ใบแจ้งหนี้", icon: Receipt, desc: "สร้างเอกสาร / ใบเสร็จ", color: "text-emerald-400" },
  { href: "/payouts", label: "บัญชีทีม", icon: Wallet, desc: "เลขบัญชีเพื่อนในทีม", color: "text-rose-400" },
  { href: "/templates", label: "เทมเพลตงาน", icon: LayoutTemplate, desc: "สร้างโปรเจกต์จาก template", color: "text-violet-400" },
  { href: "/notifications", label: "แจ้งเตือน", icon: Bell, desc: "In-app + Push", color: "text-pink-400" },
  { href: "/activity", label: "ประวัติกิจกรรม", icon: History, desc: "Log การเปลี่ยนแปลง", color: "text-amber-400" },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, desc: "โปรไฟล์ · Theme · Push", color: "text-zinc-400" },
];

/** Bottom tab มือถือ — 5 ช่อง */
export const MOBILE_NAV: NavItem[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/tasks", label: "งาน", icon: CheckSquare },
  { href: "/finance", label: "การเงิน", icon: CircleDollarSign },
  { href: "/chat", label: "แชท", icon: MessageCircle },
  { href: "/more", label: "อื่นๆ", icon: MoreHorizontal },
];

/** กลุ่มเมนูในหน้า More */
export const MORE_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "งาน",
    items: EXTRA_NAV.filter((n) =>
      ["/schedule", "/templates"].includes(n.href)
    ),
  },
  {
    title: "การเงิน",
    items: EXTRA_NAV.filter((n) =>
      ["/invoices", "/payouts"].includes(n.href)
    ),
  },
  {
    title: "ระบบ",
    items: EXTRA_NAV.filter((n) =>
      ["/notifications", "/activity", "/settings"].includes(n.href)
    ),
  },
];

export const ALL_APP_PATHS = [...MAIN_NAV, ...EXTRA_NAV, { href: "/more", label: "เมนู", icon: MoreHorizontal }];

export function isMoreSectionPath(pathname: string): boolean {
  if (pathname === "/more") return true;
  return EXTRA_NAV.some(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/")
  );
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/more") return isMoreSectionPath(pathname);
  return pathname === href || pathname.startsWith(href + "/");
}
