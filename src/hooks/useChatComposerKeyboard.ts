"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { ChatMentionInputHandle } from "@/components/ChatMentionInput";

export function useChatComposerKeyboard({ inputRef, formRef, sending, enabled }: {
  inputRef: RefObject<ChatMentionInputHandle | null>;
  formRef: RefObject<HTMLFormElement | null>;
  sending: boolean;
  enabled: boolean;
}) {
  const restoreFocus = useRef(false);
  const prepareSend = useCallback(() => { restoreFocus.current = true; }, []);
  useEffect(() => {
    if (sending || !restoreFocus.current) return;
    restoreFocus.current = false;
    const active = document.activeElement;
    if (enabled && (active === document.body || (active && formRef.current?.contains(active)))) inputRef.current?.focus();
  }, [sending, enabled, formRef, inputRef]);

  useEffect(() => {
    if (!enabled || sending) return;
    function startSlash(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]")) return;
      if (document.querySelector("dialog[open], [role=dialog], [role=menu]")) return;
      event.preventDefault();
      inputRef.current?.insertAtCursor("/");
    }
    document.addEventListener("keydown", startSlash);
    return () => document.removeEventListener("keydown", startSlash);
  }, [enabled, sending, inputRef]);
  return prepareSend;
}
