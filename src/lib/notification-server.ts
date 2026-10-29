import { queryNeon } from "@/lib/neon/server";
import { sendPushToUser } from "@/lib/push-server";
import type { NotificationKind } from "@/lib/notifications";

export type NotificationPayload = {
  userId: string;
  title: string;
  body: string;
  link?: string;
  sourceType?: string;
  sourceId?: string;
  kind?: NotificationKind;
};

type ProfileNotifyRow = {
  id: string;
  push_enabled: boolean | null;
  notify_chat: boolean | null;
  notify_mentions: boolean | null;
  notify_tasks: boolean | null;
};

type PushSubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function allowsNotification(profile: ProfileNotifyRow, kind: NotificationKind): boolean {
  if (kind === "mention") return profile.notify_mentions !== false;
  if (kind === "chat") return profile.notify_chat !== false;
  if (kind === "task") return profile.notify_tasks !== false;
  return true;
}

export async function deliverNotifications(items: NotificationPayload[]) {
  if (!items.length) return { inserted: 0, pushed: 0 };
  const userIds = [...new Set(items.map((item) => item.userId))];
  const { rows: profiles } = await queryNeon<ProfileNotifyRow>(
    `SELECT id, push_enabled, notify_chat, notify_mentions, notify_tasks
     FROM public.profiles WHERE id = ANY($1::uuid[])`,
    [userIds],
  );
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const eligible = items.filter((item) => {
    const profile = profileMap.get(item.userId);
    return profile ? allowsNotification(profile, item.kind ?? "system") : false;
  });
  if (!eligible.length) return { inserted: 0, pushed: 0 };

  const messageIds = eligible.filter((item) => item.sourceType === "message" && item.sourceId).map((item) => item.sourceId!);
  const muted = new Set<string>();
  if (messageIds.length) {
    const { rows } = await queryNeon<{ user_id: string; source_id: string }>(
      `SELECT cp.user_id, m.id AS source_id FROM public.chat_notification_preferences cp
       JOIN public.messages m ON m.channel_id=cp.channel_id
       WHERE cp.user_id=ANY($1::uuid[]) AND m.id::text=ANY($2::text[])
         AND (cp.mute_forever OR cp.muted_until > NOW())`, [userIds, messageIds],
    );
    rows.forEach((row) => muted.add(`${row.user_id}:${row.source_id}`));
  }
  const toPush: NotificationPayload[] = [];
  let inserted = 0;
  for (const item of eligible) {
    const { rows } = await queryNeon<{ id: string; push_sent: boolean; silent: boolean }>(
      `INSERT INTO public.notifications
       (user_id,title,body,link,source_type,source_id,push_sent,silent)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7)
       ON CONFLICT (user_id,source_type,source_id)
       WHERE source_type IS NOT NULL AND source_id IS NOT NULL
       DO NOTHING RETURNING id,push_sent,silent`,
      [item.userId, item.title, item.body, item.link ?? null, item.sourceType ?? null, item.sourceId ?? null, muted.has(`${item.userId}:${item.sourceId}`)],
    );
    if (rows[0]) {
      inserted += 1;
      if (!rows[0].silent && !muted.has(`${item.userId}:${item.sourceId}`)) toPush.push(item);
      continue;
    }
    if (item.sourceType && item.sourceId) {
      const existing = await queryNeon<{ push_sent: boolean; silent: boolean }>(
        `SELECT push_sent,silent FROM public.notifications
         WHERE user_id=$1 AND source_type=$2 AND source_id=$3 LIMIT 1`,
        [item.userId, item.sourceType, item.sourceId],
      );
      if (existing.rows[0] && !existing.rows[0].push_sent && !existing.rows[0].silent && !muted.has(`${item.userId}:${item.sourceId}`)) toPush.push(item);
    }
  }
  if (!toPush.length) return { inserted, pushed: 0 };

  const pushUserIds = [...new Set(toPush.map((item) => item.userId))];
  const { rows: subscriptions } = await queryNeon<PushSubscriptionRow>(
    `SELECT user_id,endpoint,p256dh,auth FROM public.push_subscriptions
     WHERE user_id = ANY($1::uuid[])`,
    [pushUserIds],
  );
  const subsByUser = new Map<string, Omit<PushSubscriptionRow, "user_id">[]>();
  for (const subscription of subscriptions) {
    const list = subsByUser.get(subscription.user_id) ?? [];
    list.push({ endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth });
    subsByUser.set(subscription.user_id, list);
  }
  const latestByUser = new Map<string, NotificationPayload>();
  for (const item of toPush) latestByUser.set(item.userId, item);

  let pushed = 0;
  await Promise.allSettled(
    [...latestByUser.entries()].map(async ([userId, item]) => {
      const profile = profileMap.get(userId);
      const subscriptionsForUser = subsByUser.get(userId);
      if (!profile || profile.push_enabled === false || !subscriptionsForUser?.length) return;
      if (item.sourceType === "message" && item.sourceId) {
        const { rows } = await queryNeon<{ muted: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM public.chat_notification_preferences cp
           JOIN public.messages m ON m.channel_id=cp.channel_id
           WHERE cp.user_id=$1 AND m.id::text=$2 AND (cp.mute_forever OR cp.muted_until > NOW())) AS muted`,
          [userId, item.sourceId],
        );
        if (rows[0]?.muted) return;
      }
      const delivery = await sendPushToUser(subscriptionsForUser, {
        title: item.title,
        body: item.body,
        link: item.link,
      });
      if (!delivery?.sent) return;
      pushed += 1;
      if (item.sourceType && item.sourceId) {
        await queryNeon(
          `UPDATE public.notifications SET push_sent=TRUE
           WHERE user_id=$1 AND source_type=$2 AND source_id=$3`,
          [userId, item.sourceType, item.sourceId],
        );
      }
    }),
  );
  return { inserted, pushed };
}
