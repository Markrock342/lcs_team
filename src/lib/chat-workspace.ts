import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel, Profile } from "./types";
import { isSchemaError } from "./chat-messages";

export const CHAT_UNREAD_EVENT = "lcs-chat-unread";

export function notifyChatUnreadChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHAT_UNREAD_EVENT));
}

export function dmKeyFor(userA: string, userB: string) {
  return [userA, userB].sort().join(":");
}

export function isDmChannel(channel: Pick<Channel, "kind" | "name">) {
  return channel.kind === "dm" || channel.name.startsWith("dm:");
}

export function otherDmUserId(
  channel: Pick<Channel, "dm_key" | "name">,
  currentUserId: string
) {
  const key = channel.dm_key || (channel.name.startsWith("dm:") ? channel.name.slice(3) : "");
  const parts = key.split(":").filter(Boolean);
  if (parts.length !== 2) return null;
  return parts.find((id) => id !== currentUserId) ?? null;
}

export function channelTitle(
  channel: Channel,
  profiles: Profile[],
  currentUserId: string | undefined
) {
  if (!isDmChannel(channel) || !currentUserId) {
    return channel.name.startsWith("#") ? channel.name.slice(1) : channel.name;
  }
  const otherId = otherDmUserId(channel, currentUserId);
  const other = profiles.find((p) => p.id === otherId);
  return other?.display_name ?? "ข้อความส่วนตัว";
}

export async function openDirectMessage(
  supabase: SupabaseClient,
  currentUserId: string,
  otherUserId: string
): Promise<{ channel: Channel | null; error: string | null }> {
  if (currentUserId === otherUserId) {
    return { channel: null, error: "ส่งข้อความหาตัวเองไม่ได้" };
  }

  const dm_key = dmKeyFor(currentUserId, otherUserId);
  const { data: existing, error: lookupError } = await supabase
    .from("channels")
    .select("*")
    .eq("dm_key", dm_key)
    .maybeSingle();

  if (existing) return { channel: existing as Channel, error: null };
  if (lookupError && !isSchemaError(lookupError.message)) {
    return { channel: null, error: lookupError.message };
  }
  if (lookupError && isSchemaError(lookupError.message)) {
    return {
      channel: null,
      error: "รัน supabase/add-chat-workspace.sql ใน Supabase ก่อน",
    };
  }

  const { data: created, error: createError } = await supabase
    .from("channels")
    .insert({
      name: `dm:${dm_key}`,
      description: "ข้อความส่วนตัว",
      kind: "dm",
      dm_key,
      created_by: currentUserId,
    })
    .select("*")
    .single();

  if (createError || !created) {
    if (createError?.message?.includes("duplicate") || createError?.code === "23505") {
      const { data: again } = await supabase
        .from("channels")
        .select("*")
        .eq("dm_key", dm_key)
        .maybeSingle();
      if (again) return { channel: again as Channel, error: null };
    }
    return {
      channel: null,
      error: createError?.message ?? "เปิดข้อความส่วนตัวไม่สำเร็จ",
    };
  }

  await supabase.from("channel_members").insert([
    { channel_id: created.id, user_id: currentUserId },
    { channel_id: created.id, user_id: otherUserId },
  ]);

  return { channel: created as Channel, error: null };
}

export async function markChannelRead(
  supabase: SupabaseClient,
  channelId: string,
  userId: string
) {
  const { error } = await supabase.from("channel_reads").upsert(
    {
      channel_id: channelId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,user_id" }
  );
  if (error && !isSchemaError(error.message)) {
    console.error("markChannelRead:", error.message);
  }
  notifyChatUnreadChanged();
}

export async function fetchUnreadCounts(
  supabase: SupabaseClient,
  userId: string,
  channelIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (!channelIds.length) return counts;

  const [readsRes, msgsRes] = await Promise.all([
    supabase
      .from("channel_reads")
      .select("channel_id, last_read_at")
      .eq("user_id", userId)
      .in("channel_id", channelIds),
    supabase
      .from("messages")
      .select("id, channel_id, created_at, sender_id, deleted_at, thread_id")
      .in("channel_id", channelIds)
      .is("deleted_at", null)
      .neq("sender_id", userId)
      .order("created_at", { ascending: false })
      .limit(800),
  ]);

  if (readsRes.error && isSchemaError(readsRes.error.message)) return counts;

  type UnreadMsg = {
    id: string;
    channel_id: string;
    created_at: string;
    sender_id: string;
    deleted_at: string | null;
    thread_id?: string | null;
  };

  let rows: UnreadMsg[] = (msgsRes.data as UnreadMsg[] | null) ?? [];
  if (msgsRes.error) {
    if (!isSchemaError(msgsRes.error.message)) return counts;
    const fallback = await supabase
      .from("messages")
      .select("id, channel_id, created_at, sender_id, deleted_at")
      .in("channel_id", channelIds)
      .is("deleted_at", null)
      .neq("sender_id", userId)
      .order("created_at", { ascending: false })
      .limit(800);
    if (fallback.error) return counts;
    rows = (fallback.data as UnreadMsg[] | null) ?? [];
  }

  const readAt = new Map(
    (readsRes.data ?? []).map((row) => [row.channel_id, row.last_read_at as string])
  );

  for (const id of channelIds) counts[id] = 0;
  for (const msg of rows) {
    if ("thread_id" in msg && msg.thread_id) continue;
    const last = readAt.get(msg.channel_id);
    if (!last || msg.created_at > last) {
      counts[msg.channel_id] = (counts[msg.channel_id] ?? 0) + 1;
    }
  }
  return counts;
}
