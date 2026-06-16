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
  channels: { name: string } | { name: string }[] | null;
};

function channelName(channels: MessageRow["channels"]): string {
  if (!channels) return "แชท";
  if (Array.isArray(channels)) return channels[0]?.name ?? "แชท";
  return channels.name;
}

export async function processChatMessageNotifications(
  authDb: SupabaseClient,
  messageId: string
) {
  const adminDb = authDb;

  const { data: msg, error } = await adminDb
    .from("messages")
    .select(
      "id, channel_id, sender_id, content, file_name, deleted_at, mentioned_ids, channels(name)"
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

  const { data: profiles } = await adminDb.from("profiles").select("id");

  const preview =
    message.content?.trim().slice(0, 80) ||
    message.file_name ||
    "ส่งไฟล์";
  const link = chatChannelHref(message.channel_id);
  const chName = channelName(message.channels);
  const mentionedIds = message.mentioned_ids ?? [];

  const items = (profiles ?? [])
    .filter((p) => p.id !== message.sender_id)
    .map((p) => {
      const mentioned = mentionedIds.includes(p.id);
      return {
        userId: p.id,
        title: mentioned
          ? `💬 ถูก mention ใน #${chName}`
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
