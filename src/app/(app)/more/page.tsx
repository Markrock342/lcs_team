"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import { MORE_SECTIONS, filterNavByAccess } from "@/lib/nav";
import { useRole } from "@/components/RoleProvider";

export default function MorePage() {
  const { canViewFinance } = useRole();
  const sections = MORE_SECTIONS.map((section) => ({
    ...section,
    items: filterNavByAccess(section.items, { canViewFinance }),
  })).filter((section) => section.items.length > 0);

  return (
    <PageShell width="medium">
      <PageHeader
        title="เมนู"
        description="เครื่องมือและพื้นที่ทำงานเพิ่มเติม"
      />

      <div className="grid gap-8 md:grid-cols-2 md:items-start">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted">
              {section.title}
            </h2>
            <div className="ticket-card divide-y divide-border overflow-hidden">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex min-h-20 items-center gap-4 px-4 py-3.5 transition-colors hover:bg-card-hover active:bg-surface-raised touch-manipulation"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-accent"
                >
                  <item.icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{item.label}</p>
                  {item.desc && (
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.desc}</p>
                  )}
                </div>
                <ChevronRight size={18} className="text-muted shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
