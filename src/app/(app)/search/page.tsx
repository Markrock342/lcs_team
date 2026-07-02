"use client";

import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import { PageHeader } from "@/components/mobile-ui";
import { useState } from "react";

export default function SearchPage() {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="ค้นหา"
        description="ค้นหางาน ลูกค้า แชท และใบแจ้งหนี้ — กด ⌘K จากที่ไหนก็ได้"
      />
      <GlobalSearchModal open={open} onClose={() => setOpen(false)} />
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full py-4 rounded-2xl border border-dashed border-accent/40 text-accent"
        >
          เปิดค้นหา
        </button>
      )}
    </div>
  );
}
