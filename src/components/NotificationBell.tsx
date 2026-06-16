"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const instanceId = useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const ok = await loadCount();
      if (cancelled || !ok) return;

      const supabase = createClient();
      const channel = supabase
        .channel(`notif-bell-${instanceId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          () => { loadCount(); }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    let cleanup: (() => void) | undefined;
    init().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [instanceId]);

  async function loadCount(): Promise<boolean> {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { count: c, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (error) return false;
      setCount(c ?? 0);
      return true;
    } catch {
      return false;
    }
  }

  return (
    <Link
      href="/notifications"
      className="relative p-2 rounded-lg hover:bg-card-hover active:bg-card-hover touch-manipulation"
      aria-label="แจ้งเตือน"
    >
      <Bell size={20} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
