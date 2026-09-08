import type { SupabaseClient } from "@supabase/supabase-js";
import { chatChannelHref } from "@/lib/channels";
import { deliverNotifications } from "@/lib/notification-server";

type MessageRow = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  file_name: string | null;
  deleted_at: string | null;
  mentioned_ids: string[] | null;
  channels: { name: string; kind?: string | null } | { name: string; kind?: string | null }[] | null;
};

function channelName(channels: MessageRow["channels"]): string {
  if (!channels) return "แชท";
  if (Array.isArray(channels)) return channels[0]?.name ?? "แชท";
  return channels.name;
}

function channelKind(channels: MessageRow["channels"]): string {
  const row = Array.isArray(channels) ? channels[0] : channels;
  return row?.kind ?? "channel";
}

export async function processChatMessageNotifications(
  authDb: SupabaseClient,
  messageId: string
) {
  const adminDb = authDb;

  const { data: msg, error } = await adminDb
    .from("messages")
    .select(
      "id, channel_id, sender_id, content, file_name, deleted_at, mentioned_ids, channels(name, kind)"
    )
    .eq("id", messageId)
    .maybeSingle();

  if (error || !msg || (msg as MessageRow).deleted_at) {
    return { inserted: 0, pushed: 0, skipped: true };
  }

  const message = msg as MessageRow;

  const { data: sender } = await adminDb
    .from("profiles")
    .select("display_name")
    .eq("id", message.sender_id)
    .maybeSingle();

  const kind = channelKind(message.channels);
  let recipientIds: string[] = [];
  if (kind === "dm") {
    const { data: members } = await adminDb
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", message.channel_id);
    recipientIds = (members ?? []).map((m) => m.user_id);
  } else {
    const { data: profiles } = await adminDb.from("profiles").select("id");
    recipientIds = (profiles ?? []).map((p) => p.id);
  }

  const preview =
    message.content?.trim().slice(0, 80) ||
    message.file_name ||
    "ส่งไฟล์";
  const link = chatChannelHref(message.channel_id);
  const chName = channelName(message.channels);
  const isDm = kind === "dm";
  const mentionedIds = message.mentioned_ids ?? [];

  const items = recipientIds
    .filter((id) => id !== message.sender_id)
    .map((id) => {
      const mentioned = mentionedIds.includes(id);
      return {
        userId: id,
        title: mentioned
          ? `💬 ถูก mention ใน ${isDm ? "ข้อความส่วนตัว" : `#${chName}`}`
          : isDm
            ? "ข้อความส่วนตัว"
            : `#${chName}`,
        body: `${sender?.display_name ?? "ทีม"}: ${preview}`,
        link,
        sourceType: "message",
        sourceId: messageId,
        kind: mentioned ? ("mention" as const) : ("chat" as const),
      };
    });

  return deliverNotifications(authDb, items);
}

export function isDispatchAuthorized(request: Request): boolean {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}
