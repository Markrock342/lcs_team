"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { CHAT_EMOJI_GROUPS } from "@/lib/chat-emoji";

export function ChatEmojiPicker({
  open,
  onClose,
  onPick,
  align = "left",
  placement = "above",
  compact = false,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  align?: "left" | "right";
  placement?: "above" | "below";
  compact?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    function position() {
      const anchor = panel!.parentElement?.getBoundingClientRect();
      if (!anchor) return;
      const width = panel!.offsetWidth;
      const height = panel!.offsetHeight;
      const left = align === "right" ? anchor.right - width : anchor.left;
      const top = placement === "above" ? anchor.top - height - 8 : anchor.bottom + 8;
      panel!.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
      panel!.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, align, placement]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="listbox"
      aria-label="เลือกอิโมจิ"
      className={`fixed z-70 max-h-[min(24rem,60dvh)] overflow-y-auto overscroll-contain ${compact ? "w-60" : "w-[min(20rem,calc(100vw-2rem))]"} rounded-xl border border-border bg-card p-2 shadow-lg`}
    >
      {CHAT_EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="mb-1 last:mb-0">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {group.label}
          </p>
          <div className={`grid gap-0.5 ${compact ? "grid-cols-4" : "grid-cols-5 sm:grid-cols-6"}`}>
            {group.items.map((emoji) => (
              <button
                key={`${group.label}-${emoji}`}
                type="button"
                onClick={() => onPick(emoji)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-lg hover:bg-card-hover"
                aria-label={`อิโมจิ ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
