"use client";

import {
  Reply,
  Trash2,
  Download,
  CornerDownRight,
  Eye,
} from "lucide-react";
import Image from "next/image";
import { Avatar } from "@/components/ui";
import { isImageFile } from "@/lib/upload";
import { downloadChatFile, getReadReceiptNames } from "@/lib/chat";
import { getMessageReplyPreview } from "@/lib/chat-messages";
import type { Message, Profile, TeamRole } from "@/lib/types";
import { isAdmin } from "@/lib/permissions";

type ChatMessageItemProps = {
  msg: Message;
  currentUserId: string | undefined;
  currentUserRole: TeamRole | undefined;
  profiles: Profile[];
  formatTime: (date: string) => string;
  onReply: (msg: Message) => void;
  onDelete: (msg: Message) => void;
};

export function ChatMessageItem({
  msg,
  currentUserId,
  currentUserRole,
  profiles,
  formatTime,
  onReply,
  onDelete,
}: ChatMessageItemProps) {
  const isOwn = msg.sender_id === currentUserId;
  const canDelete =
    isOwn || (currentUserRole ? isAdmin(currentUserRole) : false);
  const deleted = !!msg.deleted_at;
  const readBy = getReadReceiptNames(msg.reads, msg.sender_id, profiles);
  const replyPreview = getMessageReplyPreview(msg);

  return (
    <div className="flex gap-3 py-1 px-2 -mx-2 rounded-lg hover:bg-card-hover/50 group">
      {msg.sender && (
        <Avatar
          name={msg.sender.display_name}
          src={msg.sender.avatar_url}
          size="sm"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-semibold text-sm">
            {msg.sender?.display_name ?? "Unknown"}
          </span>
          <span className="text-[10px] text-muted">{formatTime(msg.created_at)}</span>
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 max-lg:opacity-100 transition-opacity">
            {!deleted && (
              <button
                type="button"
                onClick={() => onReply(msg)}
                className="p-1.5 rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                title="ตอบกลับ"
              >
                <Reply size={14} />
              </button>
            )}
            {msg.file_url && isImageFile(msg.file_type) && !deleted && (
              <button
                type="button"
                onClick={() =>
                  downloadChatFile(msg.file_url!, msg.file_name ?? "image.png")
                }
                className="p-1.5 rounded hover:bg-card-hover text-muted hover:text-accent touch-manipulation"
                title="ดาวน์โหลด"
              >
                <Download size={14} />
              </button>
            )}
            {canDelete && !deleted && (
              <button
                type="button"
                onClick={() => onDelete(msg)}
                className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 touch-manipulation"
                title="ลบข้อความ"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {replyPreview && (
          <div className="flex items-start gap-1.5 mb-1.5 pl-2 border-l-2 border-accent/40 text-xs text-muted">
            <CornerDownRight size={12} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-accent font-medium">
                {replyPreview.sender?.display_name ?? "Unknown"}
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
              <p className="text-sm whitespace-pre-wrap break-words text-zinc-200">
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
              <div className="mt-2 relative group/image rounded-lg overflow-hidden max-w-sm border border-border">
                <Image
                  src={msg.file_url}
                  alt={msg.file_name ?? "image"}
                  width={400}
                  height={300}
                  className="w-full max-h-72 object-contain"
                />
                <button
                  type="button"
                  onClick={() =>
                    downloadChatFile(msg.file_url!, msg.file_name ?? "image.png")
                  }
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-100 sm:opacity-0 sm:group-hover/image:opacity-100 transition-opacity touch-manipulation"
                  title="ดาวน์โหลด"
                >
                  <Download size={14} />
                </button>
              </div>
            )}
            {msg.file_url && !isImageFile(msg.file_type) && (
              <a
                href={msg.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-1 text-sm text-accent hover:underline"
              >
                {msg.file_name ?? "ไฟล์แนบ"}
              </a>
            )}
          </>
        )}

        {isOwn && !deleted && readBy.length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">
            <Eye size={10} />
            อ่านแล้ว: {readBy.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
