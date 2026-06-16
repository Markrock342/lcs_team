"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { chatChannelHref, getChatChannelIdFromLink } from "@/lib/channels";
import type { Channel, Profile } from "@/lib/types";

type ToastItem = {
  id: string;
  title: string;
  body: string;
  link: string;
};

const AUTO_DISMISS_MS = 4500;

export function InAppNotificationToasts({ userId }: { userId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelsRef = useRef<Pick<Channel, "id" | "name">[]>([]);
  const profilesRef = useRef<Pick<Profile, "id" | "display_name">[]>([]);

  const activeChatChannelId =
    pathname === "/chat" ? searchParams.get("channel") : null;

  const shouldSuppressChatToast = useCallback(
    (channelId: string) =>
      pathname === "/chat" && activeChatChannelId === channelId,
    [pathname, activeChatChannelId]
  );

  const dismiss = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setPhase("out");
    removeTimerRef.current = setTimeout(() => {
      setToast(null);
      setPhase("in");
    }, 280);
  }, []);

  const showToast = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const channelId = getChatChannelIdFromLink(item.link);
      if (channelId && shouldSuppressChatToast(channelId)) return;

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);

      setToast({ ...item, id: crypto.randomUUID() });
      setPhase("in");

      hideTimerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    },
    [dismiss, shouldSuppressChatToast]
  );

  useEffect(() => {
    async function loadMeta() {
      const supabase = createClient();
      const [channelsRes, profilesRes] = await Promise.all([
        supabase.from("channels").select("id, name"),
        supabase.from("profiles").select("id, display_name"),
      ]);
      channelsRef.current = channelsRes.data ?? [];
      profilesRef.current = profilesRes.data ?? [];
    }

    loadMeta();
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`in-app-toasts:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as {
            id: string;
            channel_id: string;
            sender_id: string;
            content: string | null;
            file_name: string | null;
            deleted_at: string | null;
          };

          if (msg.sender_id === userId || msg.deleted_at) return;
          if (shouldSuppressChatToast(msg.channel_id)) return;

          const sender = profilesRef.current.find((p) => p.id === msg.sender_id);
          const ch = channelsRef.current.find((c) => c.id === msg.channel_id);
          const preview =
            msg.content?.trim().slice(0, 80) ||
            msg.file_name ||
            "ส่งไฟล์";

          showToast({
            title: `#${ch?.name ?? "แชท"}`,
            body: `${sender?.display_name ?? "ทีม"}: ${preview}`,
            link: chatChannelHref(msg.channel_id),
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as {
            id: string;
            title: string;
            body: string | null;
            link: string | null;
          };

          if (n.link?.startsWith("/chat")) return;

          showToast({
            title: n.title,
            body: n.body ?? "",
            link: n.link ?? "/notifications",
          });
        }
      )
      .subscribe();

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, showToast, shouldSuppressChatToast]);

  if (!toast) return null;

  return (
    <div
      className={`fixed inset-x-0 z-[60] px-3 pointer-events-none ${
        phase === "in" ? "animate-toast-in" : "animate-toast-out"
      } top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-3`}
    >
      <button
        type="button"
        onClick={() => {
          dismiss();
          router.push(toast.link);
        }}
        className="pointer-events-auto w-full max-w-md mx-auto flex items-start gap-3 px-4 py-3 rounded-xl border border-accent/30 bg-card/95 backdrop-blur-md shadow-lg text-left touch-manipulation"
      >
        <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
          <MessageCircle size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{toast.title}</p>
          {toast.body && (
            <p className="text-sm text-muted mt-0.5 line-clamp-2">{toast.body}</p>
          )}
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              dismiss();
            }
          }}
          className="p-1 rounded-lg text-muted hover:text-foreground shrink-0 pointer-events-auto"
        >
          <X size={16} />
        </span>
      </button>
    </div>
  );
}
