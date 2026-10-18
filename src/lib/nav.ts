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
  Clock,
  Search,
  Handshake,
  Sun,
  UserRound,
  Bot,
  Code2,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** คำอธิบายสั้นๆ สำหรับหน้า More */
  desc?: string;
  color?: string;
  teamOnly?: boolean;
};

/** เมนูหลัก — sidebar desktop + ใช้บ่อย */
export const MAIN_NAV: NavItem[] = [
  { href: "/today", label: "วันนี้", icon: Sun, desc: "คิวงาน นัดขาย และข้อความ", color: "text-amber-400" },
  { href: "/tasks", label: "งาน", icon: CheckSquare, desc: "งานใหญ่ · งานย่อย · กระดาน" },
  { href: "/clients", label: "โปรเจกต์", icon: Users, desc: "ลูกค้า · ลิงก์งาน · พอร์ทัล" },
  { href: "/code", label: "โค้ด", icon: Code2, desc: "Repository · ไฟล์ · Commit · PR", color: "text-cyan-400", teamOnly: true },
  { href: "/chat", label: "แชททีม", icon: MessageCircle, desc: "ช่อง · ข้อความส่วนตัว · เธรด", color: "text-sky-400" },
  { href: "/assistant", label: "LCS Assistant", icon: Bot, desc: "ถามงานและอ่านโค้ดต่อจากมือถือ", color: "text-violet-400", teamOnly: true },
];

/** เมนูรอง — sidebar + More */
export const EXTRA_NAV: NavItem[] = [
  { href: "/dashboard", label: "ภาพรวมธุรกิจ", icon: LayoutDashboard, desc: "งาน ลูกค้า การขาย และการเงิน" },
  { href: "/sales", label: "แผนกขาย", icon: Handshake, desc: "เป้าหมาย · ติดตาม · ท่อขาย", color: "text-emerald-400" },
  { href: "/finance", label: "การเงิน", icon: CircleDollarSign, desc: "สลิป · ยอดเงิน · กองกลาง", color: "text-sky-400" },
  { href: "/schedule", label: "ตารางงาน", icon: Calendar, desc: "ปฏิทิน · Gantt · ทีม", color: "text-accent" },
  { href: "/time-reports", label: "รายงานเวลา", icon: Clock, desc: "สรุปชั่วโมงทำงาน", color: "text-cyan-400" },
  { href: "/team", label: "สมาชิกทีม", icon: UserRound, desc: "แผนก ป้ายหน้าที่ และสถานะออนไลน์", color: "text-violet-400" },
  { href: "/search", label: "ค้นหา", icon: Search, desc: "ค้นหาทั้งแอป", color: "text-sky-400" },
  { href: "/invoices", label: "ใบแจ้งหนี้", icon: Receipt, desc: "สร้างเอกสาร / ใบเสร็จ", color: "text-emerald-400" },
  { href: "/payouts", label: "บัญชีทีม", icon: Wallet, desc: "เลขบัญชีเพื่อนในทีม", color: "text-rose-400" },
  { href: "/templates", label: "เทมเพลต", icon: LayoutTemplate, desc: "งาน ใบเสนอราคา สัญญา", color: "text-violet-400" },
  { href: "/notifications", label: "กล่องงาน", icon: Bell, desc: "งานที่ต้องจัดการ", color: "text-pink-400" },
  { href: "/activity", label: "ประวัติกิจกรรม", icon: History, desc: "การเปลี่ยนแปลงล่าสุด", color: "text-amber-400" },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, desc: "โปรไฟล์ · ธีม · สุขภาพระบบ", color: "text-zinc-400" },
];

export const DESKTOP_SECONDARY_NAV: NavItem[] = [
  ...EXTRA_NAV.filter((item) => ["/dashboard", "/sales", "/finance", "/schedule"].includes(item.href)),
  { href: "/more", label: "เครื่องมือทั้งหมด", icon: MoreHorizontal, desc: "รายงาน เอกสาร ระบบ และตั้งค่า" },
];

/** Bottom tab มือถือ — 5 ช่อง */
export const MOBILE_NAV: NavItem[] = [
  { href: "/today", label: "วันนี้", icon: Sun },
  { href: "/tasks", label: "งาน", icon: CheckSquare },
  { href: "/code", label: "โค้ด", icon: Code2, teamOnly: true },
  { href: "/chat", label: "แชท", icon: MessageCircle },
  { href: "/assistant", label: "AI", icon: Bot, teamOnly: true },
];

/** กลุ่มเมนูในหน้า More */
export const MORE_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "โปรเจกต์และงาน",
    items: [
      ...MAIN_NAV.filter((n) => ["/clients", "/code"].includes(n.href)),
      ...EXTRA_NAV.filter((n) => ["/dashboard", "/schedule", "/templates", "/time-reports", "/team", "/search"].includes(n.href)),
    ],
  },
  {
    title: "การขาย",
    items: EXTRA_NAV.filter((n) => n.href === "/sales"),
  },
  {
    title: "การเงิน",
    items: [
      ...EXTRA_NAV.filter((n) => n.href === "/finance"),
      ...EXTRA_NAV.filter((n) => ["/invoices", "/payouts"].includes(n.href)),
    ],
  },
  {
    title: "ระบบ",
    items: EXTRA_NAV.filter((n) =>
      ["/notifications", "/activity", "/settings"].includes(n.href)
    ),
  },
];

export const ALL_APP_PATHS = [...MAIN_NAV, ...EXTRA_NAV, { href: "/more", label: "เมนู", icon: MoreHorizontal }];

/** หน้าเกี่ยวกับการเงินทีม — guest ห้ามเห็น */
export const FINANCE_PATHS = ["/finance", "/payouts"];

export function isFinancePath(href: string): boolean {
  return FINANCE_PATHS.some((p) => href === p || href.startsWith(p + "/"));
}

/** กรองเมนูตามสิทธิ์ — ซ่อนการเงินทีมถ้าไม่มีสิทธิ์ */
export function filterNavByAccess<T extends { href: string }>(
  items: T[],
  opts: { canViewFinance: boolean; isGuest?: boolean }
): T[] {
  return items.filter((n) =>
    (opts.canViewFinance || !isFinancePath(n.href)) &&
    !(opts.isGuest && "teamOnly" in n && n.teamOnly === true)
  );
}

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
