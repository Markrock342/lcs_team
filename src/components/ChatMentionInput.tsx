"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import {
  applyMention,
  filterMentionProfiles,
  getMentionContext,
} from "@/lib/mentions";
import { slashSuggestions } from "@/lib/chat-slash";
import type { Profile } from "@/lib/types";

type ChatMentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  profiles: Profile[];
  currentUserId?: string;
  placeholder?: string;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
};

export type ChatMentionInputHandle = {
  insertAtCursor: (text: string) => void;
  focus: () => void;
};

export const ChatMentionInput = forwardRef<ChatMentionInputHandle, ChatMentionInputProps>(
  function ChatMentionInput(
    {
      value,
      onChange,
      profiles,
      currentUserId,
      placeholder,
      onPaste,
      disabled,
    },
    ref
  ) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const slashItems = useMemo(() => slashSuggestions(value), [value]);
  const slashOpen = slashItems.length > 0 && !value.includes(" ") && !dismissed;

  const mentionContext = useMemo(
    () => (slashItems.length > 0 && !value.includes(" ") ? null : getMentionContext(value, cursor)),
    [value, cursor, slashItems.length]
  );

  const suggestions = useMemo(() => {
    if (!mentionContext || dismissed) return [];
    return filterMentionProfiles(
      profiles,
      mentionContext.query,
      currentUserId
    );
  }, [mentionContext, dismissed, profiles, currentUserId]);

  const showMenu = (suggestions.length > 0 && !!mentionContext) || slashOpen;

  useEffect(() => {
    setHighlightIndex(0);
    setDismissed(false);
  }, [mentionContext?.query, mentionContext?.start, slashItems.length]);

  useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const input = inputRef.current;
      const start = input?.selectionStart ?? value.length;
      const end = input?.selectionEnd ?? value.length;
      const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        if (!input) return;
        const pos = start + text.length;
        input.focus();
        input.setSelectionRange(pos, pos);
        setCursor(pos);
      });
    },
    focus() {
      inputRef.current?.focus();
    },
  }));

  const syncCursor = useCallback(() => {
    setCursor(inputRef.current?.selectionStart ?? value.length);
  }, [value.length]);

  const pickSuggestion = useCallback(
    (profile: Profile) => {
      if (!mentionContext) return;
      const { text, cursor: nextCursor } = applyMention(
        value,
        mentionContext,
        profile.username
      );
      onChange(text);
      setDismissed(true);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(nextCursor, nextCursor);
        setCursor(nextCursor);
      });
    },
    [mentionContext, onChange, value]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % slashItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex(
          (i) => (i - 1 + slashItems.length) % slashItems.length
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onChange(`${slashItems[highlightIndex].cmd} `);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
      }
      return;
    }

    if (!showMenu) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(
        (i) => (i - 1 + suggestions.length) % suggestions.length
      );
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickSuggestion(suggestions[highlightIndex]);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(true);
    }
  }

  return (
    <div className="relative flex-1 min-w-0">
      {slashOpen && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-lg z-20 py-1"
        >
          {slashItems.map((item, index) => (
            <li key={item.cmd} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(`${item.cmd} `)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  index === highlightIndex
                    ? "bg-accent/15 text-accent"
                    : "hover:bg-card-hover"
                }`}
              >
                <span className="font-medium">{item.cmd}</span>
                <span className="ml-2 text-muted">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showMenu && !slashOpen && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-lg z-20 py-1"
        >
          {suggestions.map((profile, index) => (
            <li key={profile.id} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(profile)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  index === highlightIndex
                    ? "bg-accent/15 text-accent"
                    : "hover:bg-card-hover"
                }`}
              >
                <Avatar
                  name={profile.display_name}
                  src={profile.avatar_url}
                  size="sm"
                />
                <span className="font-medium">@{profile.username}</span>
                <span className="text-muted truncate">{profile.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setCursor(e.target.selectionStart ?? e.target.value.length);
          setDismissed(false);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCursor}
        onClick={syncCursor}
        onSelect={syncCursor}
        onPaste={onPaste}
        placeholder={placeholder}
        className="w-full bg-transparent px-2 py-1.5 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
    </div>
  );
  }
);
