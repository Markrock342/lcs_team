"use client";

import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import { Button } from "@/components/ui";
import { Search } from "lucide-react";
import { useState } from "react";

export default function SearchPage() {
  const [open, setOpen] = useState(true);

  return (
    <PageShell width="medium">
      <PageHeader
        title="ค้นหา"
        description="ค้นหางาน ลูกค้า แชท และใบแจ้งหนี้จากที่เดียว"
      />
      <GlobalSearchModal open={open} onClose={() => setOpen(false)} />
      {!open && (
        <section className="ticket-card flex flex-col items-start gap-5 p-6 sm:p-8">
          <div className="flex min-h-14 min-w-14 items-center justify-center rounded-2xl bg-surface-soft text-muted">
            <Search size={24} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">พร้อมค้นหาเมื่อคุณต้องการ</h2>
            <p className="max-w-lg text-sm leading-relaxed text-muted">
              เปิดหน้าต่างค้นหาอีกครั้ง หรือกด ⌘K ได้จากทุกหน้า
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setOpen(true)}
          >
            <Search size={18} />
            เปิดค้นหา
          </Button>
        </section>
      )}
    </PageShell>
  );
}
