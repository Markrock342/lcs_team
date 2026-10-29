"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type MessageJump = { id: string };

/** A navigation request is consumed once, after its message is visible. */
export function useChatMessageJump({ messages, threadMessages, hidden, onJump }: {
  messages: readonly { id: string }[];
  threadMessages: readonly { id: string }[];
  hidden: boolean;
  onJump: () => void;
}) {
  const [target, setTarget] = useState<MessageJump | null>(null);
  const applied = useRef<MessageJump | null>(null);
  const requestMessageJump = useCallback((id: string | null) => {
    // A fresh request also lets the user reopen the same pinned message.
    setTarget(id ? { id } : null);
  }, []);
  const hasPendingJump = useCallback(() => target !== null && applied.current !== target, [target]);

  useLayoutEffect(() => {
    if (hidden || !target || applied.current === target) return;
    const node = document.getElementById(`msg-${target.id}`);
    if (!node || !node.getClientRects().length) return;
    applied.current = target;
    onJump();
    node.scrollIntoView({ block: "center", behavior: "auto" });
  }, [target, messages, threadMessages, hidden, onJump]);

  return { highlightMsgId: target?.id ?? null, requestMessageJump, hasPendingJump };
}
