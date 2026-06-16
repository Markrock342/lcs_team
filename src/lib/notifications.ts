import { chatChannelHref } from "./channels";

export type NotificationKind = "chat" | "mention" | "task" | "system";

export type NotificationInput = {
  userId: string;
  title: string;
  body: string;
  link?: string;
};

export function inferNotificationKind(
  title: string,
  link?: string | null
): NotificationKind {
  if (title.includes("mention") || title.includes("ถูก mention")) return "mention";
  if (link?.startsWith("/chat")) return "chat";
  if (link?.startsWith("/tasks")) return "task";
  return "system";
}

export async function sendNotifications(items: NotificationInput[]) {
  if (!items.length) return;
  try {
    await fetch("/api/notifications/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifications: items }),
    });
  } catch {
    // ignore
  }
}

export async function sendNotification(item: NotificationInput) {
  await sendNotifications([item]);
}

export async function notifyChatMessage(params: {
  channelId: string;
  channelName: string;
  senderId: string;
  senderName: string;
  preview: string;
  mentionedIds: string[];
  recipientIds: string[];
}) {
  const link = chatChannelHref(params.channelId);
  const items: NotificationInput[] = [];

  for (const userId of params.recipientIds) {
    if (userId === params.senderId) continue;

    const mentioned = params.mentionedIds.includes(userId);
    items.push({
      userId,
      title: mentioned
        ? `💬 ถูก mention ใน #${params.channelName}`
        : `#${params.channelName}`,
      body: `${params.senderName}: ${params.preview}`,
      link,
    });
  }

  await sendNotifications(items);
}
