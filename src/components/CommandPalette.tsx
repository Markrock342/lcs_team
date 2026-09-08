"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  CircleDollarSign,
  Handshake,
  MessageCircle,
  Plus,
  Receipt,
  Search,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui";
import { useRole } from "@/components/RoleProvider";
import {
  searchWorkspace,
  type WorkspaceSearchHit,
} from "@/lib/workspace-search";

const ICONS = {
  task: CheckSquare,
  client: Users,
  message: MessageCircle,
  invoice: Receipt,
  prospect: Users,
  deal: Handshake,
};

const QUICK_CREATE = [
  { href: "/tasks?create=1", label: "สร้างงาน", icon: CheckSquare },
  { href: "/clients?create=1", label: "เพิ่มลูกค้า", icon: Users },
  { href: "/sales", label: "ไปแผนกขาย", icon: Handshake },
  { href: "/sales?import=1", label: "นำเข้า Excel รายชื่อขาย", icon: Plus },
  { href: "/finance?income=1", label: "บันทึกรายรับ", icon: CircleDollarSign },
  { href: "/sales?create=deal", label: "เพิ่มดีลขาย", icon: Handshake },
  { href: "/today", label: "ไปหน้าวันนี้", icon: CheckSquare },
  { href: "/team", label: "สมาชิกทีม", icon: Users },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { canViewFinance } = useRole();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(q: string) {
    setLoading(true);
    const items = await searchWorkspace(createClient(), q, {
      includeFinance: canViewFinance,
    });
    setResults(items);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) {
      // Reset command palette when closed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const timer = setTimeout(() => void search(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, canViewFinance]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="ค้นหาและสร้างด่วน">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            id="command-palette-search"
            aria-label="ค้นหา"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา หรือเลือกคำสั่งด้านล่าง"
            className="w-full min-h-11 rounded-xl border border-border bg-background py-3 pl-9 pr-9 text-base"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="ล้างคำค้น"
              className="absolute right-2 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {query.length < 2 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUICK_CREATE.filter(
              (action) => canViewFinance || !action.href.startsWith("/finance")
            ).map((action) => (
              <button
                key={action.href}
                type="button"
                onClick={() => {
                  onClose();
                  router.push(action.href);
                }}
                className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-soft px-3 text-left hover:bg-card-hover"
              >
                <action.icon size={16} className="text-accent" />
                {action.label}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="py-4 text-center text-sm text-muted">กำลังค้นหา...</p>}
        {!loading && query.length >= 2 && results.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">ไม่พบผลลัพธ์</p>
        )}
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {results.map((result) => {
            const Icon = ICONS[result.type];
            return (
              <Link
                key={`${result.type}-${result.id}`}
                href={result.href}
                onClick={onClose}
                className="flex min-h-11 items-center gap-3 rounded-xl p-3 hover:bg-card-hover"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                  <Icon size={16} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{result.title}</p>
                  <p className="truncate text-xs text-muted">{result.subtitle}</p>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="text-center text-[10px] text-muted">กด ⌘K เพื่อเปิดคำสั่งด่วน</p>
      </div>
    </Modal>
  );
}
