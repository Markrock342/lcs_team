"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { ALL_APP_PATHS } from "@/lib/nav";

export function getPageTitle(pathname: string): string {
  const exact = ALL_APP_PATHS.find((p) => p.href === pathname);
  if (exact) return exact.label;
  const prefix = ALL_APP_PATHS.find(
    (p) => p.href !== "/more" && pathname.startsWith(p.href + "/")
  );
  return prefix?.label ?? "Limit Code";
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
            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors min-h-[40px] touch-manipulation ${
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

interface FilterSelectProps {
  label?: string;
  value: string;
  onChange: (key: string) => void;
  options: { key: string; label: string; count?: number }[];
}

/** Dropdown filter — ใช้บนมือถือแทนแท็บเยอะๆ */
export function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-muted shrink-0">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-card border border-border text-sm min-h-[44px] touch-manipulation"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.count !== undefined ? `${o.label} (${o.count})` : o.label}
          </option>
        ))}
      </select>
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
      {action && (
        <div className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto [&>a>button]:w-full sm:[&>a>button]:w-auto">
          {action}
        </div>
      )}
    </div>
  );
}

export type QuickAction = {
  href?: string;
  onClick?: () => void;
  label: string;
  icon: React.ReactNode;
  className?: string;
};

/** ปุ่มใหญ่ 2x2 สำหรับ action หลัก */
export function QuickActionGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((a) => {
        const cls = `flex flex-col items-center gap-2 p-4 rounded-2xl border-2 active:scale-[0.98] transition-all touch-manipulation ${a.className ?? "border-border bg-card hover:bg-card-hover"}`;
        const inner = (
          <>
            {a.icon}
            <span className="font-semibold text-sm text-center">{a.label}</span>
          </>
        );
        if (a.href) {
          return (
            <Link key={a.label} href={a.href} className={cls}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={a.label} type="button" onClick={a.onClick} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

export type RowMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
};

/** เมนู ⋯ สำหรับ action รอง — ลดปุ่มรกบนมือถือ */
export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2.5 rounded-xl border border-border hover:bg-card-hover text-muted touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="เมนู"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[168px] bg-card border border-border rounded-xl shadow-xl py-1 text-sm">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-card-hover text-left touch-manipulation ${
                item.danger ? "text-red-400 hover:bg-red-500/10" : ""
              }`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
