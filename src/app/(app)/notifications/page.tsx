"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/mobile-ui";
import { Button } from "@/components/ui";
import type { AppNotification } from "@/lib/extras-types";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(data ?? []);
    setLoading(false);
  }

  async function markAllRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id);
    load();
  }

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="แจ้งเตือน"
        description="In-app notifications + Push"
        action={
          items.some((n) => !n.read) ? (
            <Button variant="secondary" onClick={markAllRead}>อ่านทั้งหมด</Button>
          ) : undefined
        }
      />

      <div className="space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            className={`p-4 rounded-xl border transition-colors ${
              n.read ? "bg-card border-border opacity-70" : "bg-accent/5 border-accent/30"
            }`}
          >
            {n.link ? (
              <Link href={n.link} onClick={() => markRead(n.id)} className="block">
                <p className="font-medium text-sm">{n.title}</p>
                {n.body && <p className="text-sm text-muted mt-0.5">{n.body}</p>}
              </Link>
            ) : (
              <div onClick={() => markRead(n.id)}>
                <p className="font-medium text-sm">{n.title}</p>
                {n.body && <p className="text-sm text-muted mt-0.5">{n.body}</p>}
              </div>
            )}
            <p className="text-[10px] text-muted mt-1">
              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: th })}
            </p>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-muted py-12">ไม่มีแจ้งเตือน</p>}
      </div>
    </div>
  );
}
