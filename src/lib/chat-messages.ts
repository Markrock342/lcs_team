import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message, Profile } from "./types";

/** ระบุ FK ชัดเจน — กัน error "more than one relationship" หลังมี message_reads */
export const MESSAGE_SELECT_BASIC = "*, sender:profiles!sender_id(*)";

export const MESSAGE_SELECT_FULL = `
  *,
  sender:profiles!sender_id(*),
  reply_to:messages!messages_reply_to_id_fkey(
    id, content, sender_id, deleted_at, file_name,
    sender:profiles!sender_id(display_name)
  ),
  reads:message_reads!message_reads_message_id_fkey(
    user_id, read_at,
    reader:profiles!user_id(id, display_name, username)
  )
`;

/** PostgREST อาจคืน reply_to เป็น array (ความสัมพันธ์กลับ) — ใช้เฉพาะเมื่อมี reply_to_id */
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
  const { reply_to: _, ...rest } = msg;
  return rest;
}

function isSchemaError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("column") ||
    m.includes("relation") ||
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("more than one relationship") ||
    m.includes("could not find")
  );
}

async function fetchWithProfilesFallback(
  supabase: SupabaseClient,
  channelId: string
): Promise<{ data: Message[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return { data: [], error: error.message };
  if (!rows?.length) return { data: [], error: null };

  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", senderIds);

  const profileMap = new Map(
    (profiles as Profile[] | null)?.map((p) => [p.id, p]) ?? []
  );

  return {
    data: rows.map((row) =>
      normalizeMessage({
        ...(row as Message),
        sender: profileMap.get(row.sender_id) ?? null,
      })
    ),
    error: null,
  };
}

export async function fetchChannelMessages(
  supabase: SupabaseClient,
  channelId: string
): Promise<{ data: Message[]; error: string | null }> {
  for (const select of [MESSAGE_SELECT_FULL, MESSAGE_SELECT_BASIC]) {
    const res = await supabase
      .from("messages")
      .select(select)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!res.error) {
      const data =
        (res.data as unknown as Message[] | null)?.map(normalizeMessage) ?? [];
      return { data, error: null };
    }

    if (!isSchemaError(res.error.message)) {
      return { data: [], error: res.error.message };
    }
  }

  return fetchWithProfilesFallback(supabase, channelId);
}

async function fetchOneWithProfileFallback(
  supabase: SupabaseClient,
  id: string
): Promise<Message | null> {
  const { data: row, error } = await supabase
    .from("messages")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) return null;

  const { data: sender } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", row.sender_id)
    .single();

  return normalizeMessage({ ...(row as Message), sender: sender ?? null });
}

export async function fetchMessageById(
  supabase: SupabaseClient,
  id: string
): Promise<Message | null> {
  for (const select of [MESSAGE_SELECT_FULL, MESSAGE_SELECT_BASIC]) {
    const res = await supabase
      .from("messages")
      .select(select)
      .eq("id", id)
      .single();

    if (!res.error && res.data) {
      return normalizeMessage(res.data as unknown as Message);
    }

    if (res.error && !isSchemaError(res.error.message)) return null;
  }

  return fetchOneWithProfileFallback(supabase, id);
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
  linked_task_id?: string | null;
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
      return {
        data: normalizeMessage(res.data as unknown as Message),
        error: null,
      };
    }

    if (res.error) {
      lastError = res.error.message;

      if (isSchemaError(res.error.message)) {
        const plain = await supabase
          .from("messages")
          .insert(clean)
          .select("*")
          .single();

        if (!plain.error && plain.data) {
          const withSender = await fetchMessageById(supabase, plain.data.id);
          return { data: withSender, error: null };
        }

        if (plain.error && !isSchemaError(plain.error.message)) {
          return { data: null, error: plain.error.message };
        }
      } else {
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
