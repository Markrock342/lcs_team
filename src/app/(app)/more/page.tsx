"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/mobile-ui";
import { MORE_SECTIONS, filterNavByAccess } from "@/lib/nav";
import { useRole } from "@/components/RoleProvider";

export default function MorePage() {
  const { canViewFinance } = useRole();
  const sections = MORE_SECTIONS.map((section) => ({
    ...section,
    items: filterNavByAccess(section.items, { canViewFinance }),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
      <PageHeader
        title="เมนู"
        description="ฟีเจอร์อื่นๆ ที่ไม่อยู่ในแถบด้านล่าง"
      />

      {sections.map((section) => (
        <section key={section.title}>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2 px-1">
            {section.title}
          </p>
          <div className="grid gap-2">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-accent/30 active:bg-card-hover transition-all touch-manipulation"
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center ${item.color ?? "text-accent"}`}
                >
                  <item.icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{item.label}</p>
                  {item.desc && (
                    <p className="text-xs text-muted">{item.desc}</p>
                  )}
                </div>
                <ChevronRight size={18} className="text-muted shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
