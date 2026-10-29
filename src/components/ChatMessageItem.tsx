"use client";

import { useEffect, useRef, useState } from "react";
import {
  Reply,
  Trash2,
  Download,
  CornerDownRight,
  Eye,
  Pin,
  Pencil,
  MessageSquare,
  SmilePlus,
  MoreHorizontal,
} from "lucide-react";
import Image from "next/image";
import { Avatar } from "@/components/ui";
import { ChatImageViewer } from "@/components/ChatImageViewer";
import { ChatEmojiPicker } from "@/components/ChatEmojiPicker";
import { isImageFile } from "@/lib/upload";
import { downloadChatFile, getReadReceiptNames } from "@/lib/chat";
import { getMessageReplyPreview } from "@/lib/chat-messages";
import type { Message, Profile, TeamRole, MessageReaction } from "@/lib/types";
import { isAdmin } from "@/lib/permissions";

type ChatMessageItemProps = {
  msg: Message;
  currentUserId: string | undefined;
  currentUserRole: TeamRole | undefined;
  profiles: Profile[];
  formatTime: (date: string) => string;
  onReply: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onThread?: (msg: Message) => void;
  onPin?: (msg: Message) => void;
  onEdit?: (msg: Message) => void;
  threadCount?: number;
  reactions?: MessageReaction[];
  onReaction?: (messageId: string, emoji: string) => void;
};

export function ChatMessageItem({
  msg,
  currentUserId,
  currentUserRole,
  profiles,
  formatTime,
  onReply,
  onDelete,
  onThread,
  onPin,
  onEdit,
  threadCount = 0,
  reactions = [],
  onReaction,
}: ChatMessageItemProps) {
  const isOwn = msg.sender_id === currentUserId;
  const canDelete =
    isOwn || (currentUserRole ? isAdmin(currentUserRole) : false);
  const deleted = !!msg.deleted_at;
  const readBy = getReadReceiptNames(msg.reads, msg.sender_id, profiles);
  const replyPreview = getMessageReplyPreview(msg);
  const [imageOpen, setImageOpen] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen && !emojiOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
        setEmojiOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setActionsOpen(false);
      setEmojiOpen(false);
      actionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen, emojiOpen]);

  return (
    <div className={`flex items-start gap-2 py-1.5 ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn && (
        <Avatar
          name={msg.sender?.display_name ?? "ไม่มีชื่อ"}
          src={msg.sender?.avatar_url}
          size="sm"
        />
      )}
      <div className={`flex min-w-0 max-w-[min(85%,40rem)] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <p className="mb-1 max-w-full truncate px-1 text-xs font-semibold text-muted">
            {msg.sender?.display_name ?? "ไม่มีชื่อ"}
          </p>
        )}
        <div
          className={`w-fit max-w-full rounded-2xl px-4 py-2.5 text-left [overflow-wrap:anywhere] ${
            isOwn
              ? "rounded-tr-sm bg-accent/20"
              : "rounded-tl-sm bg-surface-raised"
          }`}
        >
          {replyPreview && (
            <div className="mb-1.5 flex items-start gap-1.5 rounded-xl bg-surface-soft px-3 py-2 text-xs text-muted">
              <CornerDownRight size={12} className="shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-accent font-medium">
                  {replyPreview.sender?.display_name ?? "ไม่มีชื่อ"}
                </span>
                <p className="truncate">
                  {replyPreview.deleted_at
                    ? "ข้อความถูกลบ"
                    : replyPreview.content ||
                      replyPreview.file_name ||
                      "ไฟล์แนบ"}
                </p>
              </div>
            </div>
          )}

          {deleted ? (
            <p className="text-sm italic text-muted">ข้อความถูกลบ</p>
          ) : (
            <>
              {msg.content && (
                <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground">
                  {msg.content.split(/(@\w+)/g).map((part, i) =>
                    part.startsWith("@") ? (
                      <span key={i} className="text-accent font-medium">
                        {part}
                      </span>
                    ) : (
                      part
                    )
                  )}
                </p>
              )}
              {msg.file_url && isImageFile(msg.file_type) && (
                <>
                  <button type="button" onClick={() => setImageOpen(true)} aria-label={`ดูรูป ${msg.file_name ?? "รูปภาพ"}`} aria-haspopup="dialog"
                    className="mt-2 block max-w-sm overflow-hidden rounded-xl border border-border bg-background text-left">
                    {thumbnailFailed ? <span className="block p-4 text-sm text-muted">{msg.file_name ?? "รูปภาพ"} · กดเปิดดูรูป</span> : <Image
                      src={msg.file_url} alt={msg.file_name ?? "รูปภาพ"} width={400} height={300} onError={() => setThumbnailFailed(true)}
                      className="max-h-72 w-full object-contain" />}
                    <span className="block px-3 py-2 text-xs text-muted">ดูรูปขนาดใหญ่</span>
                  </button>
                  {imageOpen && <ChatImageViewer src={msg.file_url} name={msg.file_name ?? "image.png"} onClose={() => setImageOpen(false)} />}
                </>
              )}
              {msg.linked_task && (
                <a
                  href="/tasks"
                  className="inline-flex items-center gap-1 mt-1 text-sm text-accent hover:underline"
                >
                  📋 {msg.linked_task.title}
                </a>
              )}
              {msg.file_url && !isImageFile(msg.file_type) && (
                <a
                  href={msg.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-2 mt-1 text-sm text-accent hover:underline"
                >
                  {msg.file_name ?? "ไฟล์แนบ"}
                </a>
              )}
            </>
          )}

        </div>

        {!deleted && onReaction && reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {Object.entries(
              reactions.reduce(
                (acc, r) => {
                  acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                  return acc;
                },
                {} as Record<string, number>
              )
            ).map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReaction(msg.id, emoji)}
                className={`flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-sm ${
                  reactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                    ? "border-accent/50 bg-accent/15"
                    : "border-border bg-background"
                }`}
                aria-label={`รีแอค ${emoji} ${count} คน`}
              >
                {emoji} {count}
              </button>
            ))}
          </div>
        )}

        <div className={`flex max-w-full flex-wrap items-center gap-x-2 text-xs text-muted ${isOwn ? "justify-end" : "justify-start"}`}>
          <time dateTime={msg.created_at}>{formatTime(msg.created_at)}</time>
          {msg.edited_at && !deleted && <span>แก้ไขแล้ว</span>}
          {msg.pinned_at && !deleted && (
            <span className="inline-flex items-center gap-1 text-accent">
              <Pin size={12} /> ปักหมุด
            </span>
          )}
          {!deleted && (
            <div ref={actionsRef} className={`relative ${isOwn ? "" : "-order-1"}`}>
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(!actionsOpen && !emojiOpen);
                  setEmojiOpen(false);
                }}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-card-hover hover:text-foreground"
                aria-label="ตัวเลือกข้อความ"
                aria-expanded={actionsOpen || emojiOpen}
              >
                <MoreHorizontal size={18} />
              </button>
              {(actionsOpen || emojiOpen) && (
                <div
                  role="group"
                  aria-label="จัดการข้อความ"
                  onClick={() => setActionsOpen(false)}
                  className={`absolute bottom-full z-20 mb-1 flex w-60 max-w-[calc(100vw-4rem)] flex-wrap gap-1 rounded-xl border border-border bg-card p-2 shadow-lg ${isOwn ? "right-0" : "left-0"}`}
                >
                  {!deleted && onReaction && (
                    <>
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setEmojiOpen((open) => !open)}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                        title="อิโมจิ"
                        aria-label="รีแอคด้วยอิโมจิ"
                        aria-expanded={emojiOpen}
                      >
                        <SmilePlus size={14} />
                      </button>
                      <ChatEmojiPicker
                        open={emojiOpen}
                        onClose={() => setEmojiOpen(false)}
                        onPick={(emoji) => {
                          onReaction(msg.id, emoji);
                          setEmojiOpen(false);
                        }}
                        compact
                        align={isOwn ? "right" : "left"}
                      />
                    </>
                  )}
                  {!deleted && onThread && (
                    <button
                      type="button"
                      onClick={() => onThread(msg)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                      title="เปิดเธรด"
                      aria-label="เปิดเธรด"
                    >
                      <MessageSquare size={14} />
                    </button>
                  )}
                  {!deleted && (
                    <button
                      type="button"
                      onClick={() => onReply(msg)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                      title="ตอบกลับ"
                      aria-label="ตอบกลับ"
                    >
                      <Reply size={14} />
                    </button>
                  )}
                  {!deleted && onPin && (
                    <button
                      type="button"
                      onClick={() => onPin(msg)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                      title={msg.pinned_at ? "เลิกปักหมุด" : "ปักหมุด"}
                      aria-label={msg.pinned_at ? "เลิกปักหมุด" : "ปักหมุด"}
                    >
                      <Pin size={14} />
                    </button>
                  )}
                  {isOwn && !deleted && onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(msg)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                      title="แก้ไข"
                      aria-label="แก้ไขข้อความ"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {msg.file_url && isImageFile(msg.file_type) && !deleted && (
                    <button
                      type="button"
                      onClick={() =>
                        downloadChatFile(msg.file_url!, msg.file_name ?? "image.png")
                      }
                      className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                      title="ดาวน์โหลด"
                      aria-label="ดาวน์โหลดไฟล์"
                    >
                      <Download size={14} />
                    </button>
                  )}
                  {canDelete && !deleted && (
                    <button
                      type="button"
                      onClick={() => onDelete(msg)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-red-500/10 text-muted hover:text-red-400 touch-manipulation"
                      title="ลบข้อความ"
                      aria-label="ลบข้อความ"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                </div>
              )}
            </div>
          )}
        </div>

        {isOwn && !deleted && readBy.length > 0 && (
          <p className="flex max-w-full items-start gap-1 text-xs text-muted [overflow-wrap:anywhere]">
            <Eye size={12} className="mt-0.5 shrink-0" />
            อ่านแล้ว: {readBy.join(", ")}
          </p>
        )}
        {!deleted && onThread && threadCount > 0 && (
          <button
            type="button"
            onClick={() => onThread(msg)}
            className="min-h-11 text-xs font-medium text-accent hover:underline"
          >
            {threadCount} ข้อความในเธรด
          </button>
        )}
      </div>
    </div>
  );
}
