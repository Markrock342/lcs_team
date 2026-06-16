import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
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

function allowsNotification(
  profile: ProfileNotifyRow,
  kind: NotificationKind,
  mentioned?: boolean
): boolean {
  if (kind === "mention" || mentioned) {
    return profile.notify_mentions !== false;
  }
  if (kind === "chat") return profile.notify_chat !== false;
  if (kind === "task") return profile.notify_tasks !== false;
  return true;
}

function allowsPush(profile: ProfileNotifyRow): boolean {
  return profile.push_enabled !== false;
}

export async function deliverNotifications(
  authDb: SupabaseClient,
  items: NotificationPayload[]
) {
  if (!items.length) return { inserted: 0, pushed: 0 };

  const admin = createAdminClient();
  const db = admin ?? authDb;
  const userIds = [...new Set(items.map((n) => n.userId))];

  const { data: profiles } = await db
    .from("profiles")
    .select(
      "id, push_enabled, notify_chat, notify_mentions, notify_tasks"
    )
    .in("id", userIds);

  const profileMap = new Map(
    (profiles as ProfileNotifyRow[] | null)?.map((p) => [p.id, p]) ?? []
  );

  const eligible = items.filter((item) => {
    const profile = profileMap.get(item.userId);
    if (!profile) return false;
    const kind = item.kind ?? "system";
    const mentioned = kind === "mention";
    return allowsNotification(profile, kind, mentioned);
  });

  if (!eligible.length) return { inserted: 0, pushed: 0 };

  const toPush: NotificationPayload[] = [];
  let inserted = 0;

  for (const item of eligible) {
    const row = {
      user_id: item.userId,
      title: item.title,
      body: item.body,
      link: item.link ?? null,
      source_type: item.sourceType ?? null,
      source_id: item.sourceId ?? null,
      push_sent: false,
    };

    const { data, error } = await authDb
      .from("notifications")
      .insert(row)
      .select("id, push_sent")
      .maybeSingle();

    if (data) {
      inserted++;
      toPush.push(item);
      continue;
    }

    if (error?.code === "23505" && item.sourceType && item.sourceId) {
      const { data: existing } = await db
        .from("notifications")
        .select("id, push_sent")
        .eq("user_id", item.userId)
        .eq("source_type", item.sourceType)
        .eq("source_id", item.sourceId)
        .maybeSingle();

      if (existing && !existing.push_sent) {
        toPush.push(item);
      }
    }
  }

  if (!toPush.length) return { inserted, pushed: 0 };

  const pushUserIds = [...new Set(toPush.map((n) => n.userId))];

  const { data: allSubs } = await db
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", pushUserIds);

  const subsByUser = new Map<
    string,
    { endpoint: string; p256dh: string; auth: string }[]
  >();
  for (const sub of allSubs ?? []) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push({
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    });
    subsByUser.set(sub.user_id, list);
  }

  const latestByUser = new Map<string, NotificationPayload>();
  for (const item of toPush) {
    latestByUser.set(item.userId, item);
  }

  let pushed = 0;

  await Promise.allSettled(
    [...latestByUser.entries()].map(async ([userId, n]) => {
      const profile = profileMap.get(userId);
      if (!profile || !allowsPush(profile)) return;

      const subs = subsByUser.get(userId);
      if (!subs?.length) return;

      await sendPushToUser(subs, {
        title: n.title,
        body: n.body,
        link: n.link,
      });
      pushed++;

      if (n.sourceType && n.sourceId) {
        await db
          .from("notifications")
          .update({ push_sent: true })
          .eq("user_id", userId)
          .eq("source_type", n.sourceType)
          .eq("source_id", n.sourceId);
      }
    })
  );

  return { inserted, pushed };
}
