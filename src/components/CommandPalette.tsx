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
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui";

type SearchResult = {
  type: "task" | "client" | "message" | "invoice" | "prospect" | "deal";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

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
  { href: "/sales?view=prospects", label: "เปิดผู้ช่วย Gemini", icon: Sparkles },
  { href: "/finance?income=1", label: "บันทึกรายรับ", icon: CircleDollarSign },
  { href: "/sales?create=deal", label: "เพิ่มดีลขาย", icon: Handshake },
  { href: "/today", label: "ไปหน้าวันนี้", icon: CheckSquare },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(q: string) {
    setLoading(true);
    const supabase = createClient();
    const pattern = `%${q}%`;
    const [tasksRes, clientsRes, messagesRes, invoicesRes, prospectsRes, dealsRes] =
      await Promise.all([
        supabase.from("tasks").select("id, title, client:clients(name)").ilike("title", pattern).limit(6),
        supabase.from("clients").select("id, name, company").ilike("name", pattern).limit(6),
        supabase.from("messages").select("id, content, channel_id, channels(name)").is("deleted_at", null).ilike("content", pattern).limit(4),
        supabase.from("invoices").select("id, title, client:clients(name)").ilike("title", pattern).limit(4),
        supabase.from("sales_prospects").select("id, name, contact_phone").ilike("name", pattern).limit(6),
        supabase.from("sales_deals").select("id, title, company").ilike("title", pattern).limit(4),
      ]);

    const items: SearchResult[] = [];
    for (const row of tasksRes.data ?? []) {
      const raw = row as { id: string; title: string; client?: { name: string } | { name: string }[] | null };
      const client = Array.isArray(raw.client) ? raw.client[0] : raw.client;
      items.push({ type: "task", id: raw.id, title: raw.title, subtitle: client?.name ?? "งาน", href: `/tasks?open=${raw.id}` });
    }
    for (const row of clientsRes.data ?? []) {
      items.push({ type: "client", id: row.id, title: row.name, subtitle: row.company ?? "ลูกค้า", href: `/clients/${row.id}` });
    }
    for (const row of messagesRes.data ?? []) {
      const raw = row as { id: string; content: string | null; channels?: { name: string } | { name: string }[] | null };
      const channel = Array.isArray(raw.channels) ? raw.channels[0] : raw.channels;
      items.push({ type: "message", id: raw.id, title: (raw.content ?? "").slice(0, 80), subtitle: `#${channel?.name ?? "chat"}`, href: "/chat" });
    }
    for (const row of invoicesRes.data ?? []) {
      const raw = row as { id: string; title: string; client?: { name: string } | { name: string }[] | null };
      const client = Array.isArray(raw.client) ? raw.client[0] : raw.client;
      items.push({ type: "invoice", id: raw.id, title: raw.title, subtitle: client?.name ?? "เอกสาร", href: "/invoices" });
    }
    for (const row of prospectsRes.data ?? []) {
      items.push({ type: "prospect", id: row.id, title: row.name, subtitle: row.contact_phone ?? "เป้าหมาย", href: `/sales?view=prospects&open=${row.id}` });
    }
    for (const row of dealsRes.data ?? []) {
      items.push({ type: "deal", id: row.id, title: row.title, subtitle: row.company ?? "ดีล", href: `/sales?view=pipeline&open=${row.id}` });
    }
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
  }, [query]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="ค้นหาและสร้างด่วน">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา หรือเลือกคำสั่งด้านล่าง"
            className="w-full rounded-xl border border-border bg-background py-3 pl-9 pr-9 text-base"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              <X size={16} />
            </button>
          )}
        </div>

        {query.length < 2 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUICK_CREATE.map((action) => (
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
                className="flex items-center gap-3 rounded-xl p-3 hover:bg-card-hover"
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
