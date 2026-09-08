"use client";

import { useEffect, useRef } from "react";
import { CHAT_EMOJI_GROUPS } from "@/lib/chat-emoji";

export function ChatEmojiPicker({
  open,
  onClose,
  onPick,
  align = "left",
  placement = "above",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  align?: "left" | "right";
  placement?: "above" | "below";
}) {
  const panelRef = useRef<HTMLDivElement>(null);

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
      className={`absolute z-30 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-2 shadow-lg ${
        placement === "above" ? "bottom-full mb-1" : "top-full mt-1"
      } ${align === "right" ? "right-0" : "left-0"}`}
    >
      {CHAT_EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="mb-1 last:mb-0">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {group.label}
          </p>
          <div className="grid grid-cols-8 gap-0.5">
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
