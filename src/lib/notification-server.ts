import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push-server";

export type NotificationPayload = {
  userId: string;
  title: string;
  body: string;
  link?: string;
};

export async function deliverNotifications(
  authDb: SupabaseClient,
  items: NotificationPayload[]
) {
  if (!items.length) return;

  const rows = items.map((n) => ({
    user_id: n.userId,
    title: n.title,
    body: n.body,
    link: n.link ?? null,
  }));

  await authDb.from("notifications").insert(rows);

  const admin = createAdminClient();
  const db = admin ?? authDb;
  const userIds = [...new Set(items.map((n) => n.userId))];

  const [{ data: profiles }, { data: allSubs }] = await Promise.all([
    db.from("profiles").select("id, push_enabled").in("id", userIds),
    db
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", userIds),
  ]);

  const pushEnabled = new Map(
    profiles?.map((p) => [p.id, p.push_enabled !== false]) ?? []
  );

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
  for (const item of items) {
    latestByUser.set(item.userId, item);
  }

  await Promise.allSettled(
    [...latestByUser.entries()].map(async ([userId, n]) => {
      if (!pushEnabled.get(userId)) return;
      const subs = subsByUser.get(userId);
      if (!subs?.length) return;
      await sendPushToUser(subs, {
        title: n.title,
        body: n.body,
        link: n.link,
      });
    })
  );
}
