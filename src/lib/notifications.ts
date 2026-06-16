import { createClient } from "@/lib/supabase/client";
import { chatChannelHref } from "./channels";

export type NotificationKind = "chat" | "mention" | "task" | "system";

export type NotificationInput = {
  userId: string;
  title: string;
  body: string;
  link?: string;
  sourceType?: string;
  sourceId?: string;
  kind?: NotificationKind;
};

export function inferNotificationKind(
  title: string,
  link?: string | null
): NotificationKind {
  if (title.includes("mention") || title.includes("ถูก mention")) {
    return "mention";
  }
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

/** เรียกหลังส่งข้อความสำเร็จ — idempotent บน server */
export async function dispatchChatNotifications(messageId: string) {
  try {
    await fetch("/api/notifications/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
  } catch {
    // DB trigger เป็น backup
  }
}

export async function markChatChannelNotificationsRead(channelId: string) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const link = chatChannelHref(channelId);
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .eq("link", link);
  } catch {
    // ignore
  }
}

export type NotificationPrefs = {
  notify_chat: boolean;
  notify_mentions: boolean;
  notify_tasks: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notify_chat: true,
  notify_mentions: true,
  notify_tasks: true,
};
