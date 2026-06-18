import Link from "next/link";
import {
  Calendar,
  Receipt,
  History,
  Bell,
  LayoutTemplate,
  Settings,
  Download,
  Globe,
  ChevronRight,
  Wallet,
} from "lucide-react";

const ITEMS = [
  { href: "/schedule", label: "ตารางงาน", desc: "ปฏิทินรายเดือน + Gantt", icon: Calendar, color: "text-accent" },
  { href: "/invoices", label: "ใบแจ้งหนี้", desc: "เก็บเงิน / มัดจำ / งวด", icon: Receipt, color: "text-emerald-400" },
  { href: "/payouts", label: "จ่ายทีม", desc: "โอนจ้างเพื่อน · แนบสลิป", icon: Wallet, color: "text-rose-400" },
  { href: "/templates", label: "เทมเพลตงาน", desc: "สร้างโปรเจกต์จาก template", icon: LayoutTemplate, color: "text-violet-400" },
  { href: "/activity", label: "ประวัติกิจกรรม", desc: "Log การเปลี่ยนแปลงทั้งหมด", icon: History, color: "text-amber-400" },
  { href: "/notifications", label: "แจ้งเตือน", desc: "In-app + Push notifications", icon: Bell, color: "text-pink-400" },
  { href: "/settings", label: "ตั้งค่า", desc: "PWA, Push, Theme, Export", icon: Settings, color: "text-zinc-400" },
];

export default function MorePage() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">เมนูเพิ่มเติม</h1>
        <p className="text-muted text-sm mt-1">ฟีเจอร์ทั้งหมดของ Limit Code Studio</p>
      </div>
      <div className="grid gap-2">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-accent/30 active:bg-card-hover transition-all touch-manipulation"
          >
            <div className={`w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center ${item.color}`}>
              <item.icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{item.label}</p>
              <p className="text-xs text-muted">{item.desc}</p>
            </div>
            <ChevronRight size={18} className="text-muted shrink-0" />
          </Link>
        ))}
      </div>
      <div className="p-4 bg-accent/10 border border-accent/20 rounded-2xl">
        <div className="flex items-start gap-3">
          <Globe size={20} className="text-accent shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Client Portal</p>
            <p className="text-xs text-muted mt-1">
              เปิด Portal ที่หน้าลูกค้า → แชร์ลิงก์ให้ลูกค้าดู progress ได้
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
