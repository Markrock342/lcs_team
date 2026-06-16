"use client";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "ภาพรวม",
  "/clients": "ลูกค้า",
  "/tasks": "งาน",
  "/schedule": "ตารางงาน",
  "/chat": "แชททีม",
  "/more": "เมนู",
  "/invoices": "ใบแจ้งหนี้",
  "/activity": "ประวัติ",
  "/notifications": "แจ้งเตือน",
  "/settings": "ตั้งค่า",
  "/templates": "เทมเพลต",
};

export function getPageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? "Limit Code";
}

interface FilterTabsProps {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}

/** แท็บ filter — มือถือ wrap ได้ ไม่โดนตัด */
export function FilterTabs({ tabs, active, onChange }: FilterTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const label =
          tab.count !== undefined ? `${tab.label} (${tab.count})` : tab.label;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors min-h-[40px] ${
              active === tab.key
                ? "bg-accent/20 text-accent border border-accent/40"
                : "bg-card border border-border text-muted hover:text-foreground active:bg-card-hover"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** หัวหน้าเพจ — ปุ่มเต็มความกว้างบนมือถือ */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
        {description && (
          <p className="text-muted mt-1 text-sm">{description}</p>
        )}
      </div>
      {action && <div className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">{action}</div>}
    </div>
  );
}
