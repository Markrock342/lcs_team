import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "./types";

export const MESSAGE_SELECT_BASIC = "*, sender:profiles(*)";

export const MESSAGE_SELECT_FULL = `
  *,
  sender:profiles(*),
  reply_to:messages!reply_to_id(
    id, content, sender_id, deleted_at, file_name,
    sender:profiles(display_name)
  ),
  reads:message_reads(
    user_id, read_at,
    reader:profiles(id, display_name, username)
  )
`;

function isSchemaError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("column") ||
    m.includes("relation") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  );
}

export async function fetchChannelMessages(
  supabase: SupabaseClient,
  channelId: string
): Promise<{ data: Message[]; error: string | null }> {
  const full = await supabase
    .from("messages")
    .select(MESSAGE_SELECT_FULL)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (!full.error) {
    return { data: (full.data as Message[]) ?? [], error: null };
  }

  const basic = await supabase
    .from("messages")
    .select(MESSAGE_SELECT_BASIC)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (basic.error) {
    return { data: [], error: basic.error.message };
  }

  return { data: (basic.data as Message[]) ?? [], error: null };
}

export async function fetchMessageById(
  supabase: SupabaseClient,
  id: string
): Promise<Message | null> {
  const full = await supabase
    .from("messages")
    .select(MESSAGE_SELECT_FULL)
    .eq("id", id)
    .single();

  if (!full.error && full.data) return full.data as Message;

  const basic = await supabase
    .from("messages")
    .select(MESSAGE_SELECT_BASIC)
    .eq("id", id)
    .single();

  return basic.data ? (basic.data as Message) : null;
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
};

export async function insertChatMessage(
  supabase: SupabaseClient,
  payload: InsertPayload
): Promise<{ data: Message | null; error: string | null }> {
  const attempts: Record<string, unknown>[] = [
    { ...payload },
    { ...payload, reply_to_id: undefined },
    {
      channel_id: payload.channel_id,
      sender_id: payload.sender_id,
      content: payload.content,
      file_url: payload.file_url,
      file_name: payload.file_name,
      file_type: payload.file_type,
    },
  ];

  let lastError = "ส่งข้อความไม่สำเร็จ";

  for (const body of attempts) {
    const clean = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined)
    );

    const res = await supabase
      .from("messages")
      .insert(clean)
      .select(MESSAGE_SELECT_BASIC)
      .single();

    if (!res.error && res.data) {
      return { data: res.data as Message, error: null };
    }

    if (res.error) {
      lastError = res.error.message;
      if (!isSchemaError(res.error.message)) {
        return { data: null, error: lastError };
      }
    }
  }

  return { data: null, error: lastError };
}

export async function markMessagesAsReadSafe(
  supabase: SupabaseClient,
  messageIds: string[],
  userId: string
) {
  if (!messageIds.length) return;

  const { error } = await supabase.from("message_reads").upsert(
    messageIds.map((message_id) => ({ message_id, user_id: userId })),
    { onConflict: "message_id,user_id" }
  );

  if (error && !isSchemaError(error.message)) {
    console.error("markMessagesAsRead:", error.message);
  }
}
