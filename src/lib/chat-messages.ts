import type { SupabaseClient } from "@supabase/supabase-js";
import { neonRequest } from "./neon/client";
import type { Message } from "./types";

export const MESSAGE_SELECT_BASIC = "*, sender:profiles!sender_id(*)";
export const MESSAGE_SELECT_FULL = MESSAGE_SELECT_BASIC;

export function getMessageReplyPreview(msg: Message) {
  if (!msg.reply_to_id) return null;
  const rt = msg.reply_to;
  if (!rt || Array.isArray(rt)) return null;
  if (typeof rt === "object" && "id" in rt && rt.id) return rt;
  return null;
}

function normalizeMessage(msg: Message): Message {
  const reply_to = getMessageReplyPreview(msg);
  if (reply_to) return { ...msg, reply_to };
  return { ...msg, reply_to: undefined };
}

export function isSchemaError(message: string) {
  const m = message.toLowerCase();
  return m.includes("column") || m.includes("relation") || m.includes("schema") || m.includes("does not exist");
}

export async function fetchChannelMessages(
  _supabase: SupabaseClient,
  channelId: string,
  opts?: { threadId?: string | null }
): Promise<{ data: Message[]; error: string | null }> {
  try {
    const params = new URLSearchParams({ mode: "messages", channelId });
    if (opts?.threadId) params.set("threadId", opts.threadId);
    const { messages } = await neonRequest<{ messages: Message[] }>(`/api/neon/chat?${params}`, { cache: "no-store" });
    return { data: (messages ?? []).map(normalizeMessage), error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "โหลดข้อความไม่สำเร็จ" };
  }
}

export async function fetchThreadCounts(
  _supabase: SupabaseClient,
  rootIds: string[]
): Promise<Record<string, number>> {
  if (!rootIds.length) return {};
  try {
    const params = new URLSearchParams({ mode: "thread-counts", ids: rootIds.join(",") });
    const { counts } = await neonRequest<{ counts: Record<string, number> }>(`/api/neon/chat?${params}`, { cache: "no-store" });
    return counts ?? {};
  } catch {
    return {};
  }
}

export async function fetchMessageById(
  _supabase: SupabaseClient,
  id: string
): Promise<Message | null> {
  try {
    const { message } = await neonRequest<{ message: Message | null }>(
      `/api/neon/chat?mode=message&id=${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    return message ? normalizeMessage(message) : null;
  } catch {
    return null;
  }
}

type InsertPayload = {
  channel_id: string;
  sender_id: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  mentioned_ids?: string[];
  reply_to_id?: string | null;
  thread_id?: string | null;
  linked_task_id?: string | null;
};

export async function insertChatMessage(
  _supabase: SupabaseClient,
  payload: InsertPayload
): Promise<{ data: Message | null; error: string | null }> {
  try {
    const { message } = await neonRequest<{ message: Message }>("/api/neon/chat", {
      method: "POST",
      body: JSON.stringify({ action: "message", data: payload }),
    });
    return { data: normalizeMessage(message), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "ส่งข้อความไม่สำเร็จ" };
  }
}

export async function markMessagesAsReadSafe(
  _supabase: SupabaseClient,
  messageIds: string[],
  userId: string
) {
  void userId;
  if (!messageIds.length) return;
  try {
    await neonRequest("/api/neon/chat", {
      method: "POST",
      body: JSON.stringify({ action: "read-messages", data: { ids: messageIds } }),
    });
  } catch (error) {
    console.error("markMessagesAsRead:", error);
  }
}
