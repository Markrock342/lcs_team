import { chatMessageHref } from "@/lib/channels";
import { deliverNotifications } from "@/lib/notification-server";
import { queryNeon } from "@/lib/neon/server";

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
  messageId: string
) {
  const { rows } = await queryNeon<MessageRow>(
    `SELECT m.id, m.channel_id, m.sender_id, m.content, m.file_name, m.deleted_at, m.mentioned_ids,
      jsonb_build_object('name', c.name, 'kind', c.kind) AS channels
     FROM public.messages m JOIN public.channels c ON c.id = m.channel_id WHERE m.id = $1 LIMIT 1`,
    [messageId]
  );
  const msg = rows[0];
  if (!msg || msg.deleted_at) {
    return { inserted: 0, pushed: 0, skipped: true };
  }

  const message = msg;

  const { rows: senders } = await queryNeon<{ display_name: string }>(
    `SELECT display_name FROM public.profiles WHERE id=$1 LIMIT 1`,
    [message.sender_id],
  );
  const sender = senders[0];

  const kind = channelKind(message.channels);
  let recipientIds: string[] = [];
  if (kind === "dm") {
    const { rows: members } = await queryNeon<{ user_id: string }>(
      `SELECT user_id FROM public.channel_members WHERE channel_id = $1`, [message.channel_id]
    );
    recipientIds = members.map((m) => m.user_id);
  } else {
    const { rows: profiles } = await queryNeon<{ id: string }>(`SELECT id FROM public.profiles`);
    recipientIds = profiles.map((profile) => profile.id);
  }

  const preview =
    message.content?.trim().slice(0, 80) ||
    message.file_name ||
    "ส่งไฟล์";
  const link = chatMessageHref(message.channel_id, message.id);
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

  return deliverNotifications(items);
}

export function isDispatchAuthorized(request: Request): boolean {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}
