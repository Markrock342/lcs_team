"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, X, CheckSquare, Users, MessageCircle, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui";

type SearchResult = {
  type: "task" | "client" | "message" | "invoice";
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
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function GlobalSearchModal({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => search(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function search(q: string) {
    setLoading(true);
    const supabase = createClient();
    const pattern = `%${q}%`;

    const [tasksRes, clientsRes, messagesRes, invoicesRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, client:clients(name)")
        .ilike("title", pattern)
        .limit(8),
      supabase
        .from("clients")
        .select("id, name, company")
        .ilike("name", pattern)
        .limit(8),
      supabase
        .from("messages")
        .select("id, content, channel_id, channels(name)")
        .is("deleted_at", null)
        .ilike("content", pattern)
        .limit(6),
      supabase
        .from("invoices")
        .select("id, title, client:clients(name)")
        .ilike("title", pattern)
        .limit(6),
    ]);

    const items: SearchResult[] = [];

    for (const t of tasksRes.data ?? []) {
      const raw = t as {
        id: string;
        title: string;
        client?: { name: string } | { name: string }[] | null;
      };
      const client = Array.isArray(raw.client) ? raw.client[0] : raw.client;
      items.push({
        type: "task",
        id: raw.id,
        title: raw.title,
        subtitle: client?.name ?? "งาน",
        href: "/tasks",
      });
    }
    for (const c of clientsRes.data ?? []) {
      items.push({
        type: "client",
        id: c.id,
        title: c.name,
        subtitle: c.company ?? "ลูกค้า",
        href: `/clients/${c.id}`,
      });
    }
    for (const m of messagesRes.data ?? []) {
      const raw = m as {
        id: string;
        content: string | null;
        channels?: { name: string } | { name: string }[] | null;
      };
      const channel = Array.isArray(raw.channels) ? raw.channels[0] : raw.channels;
      items.push({
        type: "message",
        id: raw.id,
        title: (raw.content ?? "").slice(0, 80),
        subtitle: `#${channel?.name ?? "chat"}`,
        href: "/chat",
      });
    }
    for (const inv of invoicesRes.data ?? []) {
      const raw = inv as {
        id: string;
        title: string;
        client?: { name: string } | { name: string }[] | null;
      };
      const client = Array.isArray(raw.client) ? raw.client[0] : raw.client;
      items.push({
        type: "invoice",
        id: raw.id,
        title: raw.title,
        subtitle: client?.name ?? "เอกสาร",
        href: "/invoices",
      });
    }

    setResults(items);
    setLoading(false);
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="ค้นหาทั้งแอป">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหางาน, ลูกค้า, แชท, ใบแจ้งหนี้..."
            className="w-full pl-9 pr-9 py-3 rounded-xl bg-background border border-border text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {loading && (
          <p className="text-sm text-muted text-center py-4">กำลังค้นหา...</p>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <p className="text-sm text-muted text-center py-4">ไม่พบผลลัพธ์</p>
        )}

        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {results.map((r) => {
            const Icon = ICONS[r.type];
            return (
              <Link
                key={`${r.type}-${r.id}`}
                href={r.href}
                onClick={onClose}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-card-hover border border-transparent hover:border-border touch-manipulation"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted truncate">{r.subtitle}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <p className="text-[10px] text-muted text-center">
          กด ⌘K หรือ Ctrl+K เพื่อเปิดค้นหา
        </p>
      </div>
    </Modal>
  );
}
