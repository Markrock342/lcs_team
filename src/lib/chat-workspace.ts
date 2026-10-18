import type { SupabaseClient } from "@supabase/supabase-js";
import { neonRequest } from "./neon/client";
import type { Channel, Profile } from "./types";

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

export function otherDmUserId(channel: Pick<Channel, "dm_key" | "name">, currentUserId: string) {
  const key = channel.dm_key || (channel.name.startsWith("dm:") ? channel.name.slice(3) : "");
  const parts = key.split(":").filter(Boolean);
  return parts.length === 2 ? parts.find((id) => id !== currentUserId) ?? null : null;
}

export function channelTitle(channel: Channel, profiles: Profile[], currentUserId: string | undefined) {
  if (!isDmChannel(channel) || !currentUserId) return channel.name.startsWith("#") ? channel.name.slice(1) : channel.name;
  const other = profiles.find((p) => p.id === otherDmUserId(channel, currentUserId));
  return other?.display_name ?? "ข้อความส่วนตัว";
}

export async function openDirectMessage(
  _supabase: SupabaseClient,
  currentUserId: string,
  otherUserId: string
): Promise<{ channel: Channel | null; error: string | null }> {
  if (currentUserId === otherUserId) return { channel: null, error: "ส่งข้อความหาตัวเองไม่ได้" };
  try {
    const { channel } = await neonRequest<{ channel: Channel }>("/api/neon/chat", {
      method: "POST",
      body: JSON.stringify({ action: "dm", data: { other_user_id: otherUserId } }),
    });
    return { channel, error: null };
  } catch (error) {
    return { channel: null, error: error instanceof Error ? error.message : "เปิดข้อความส่วนตัวไม่สำเร็จ" };
  }
}

export async function markChannelRead(_supabase: SupabaseClient, channelId: string, userId: string) {
  void userId;
  try {
    await neonRequest("/api/neon/chat", {
      method: "POST",
      body: JSON.stringify({ action: "read-channel", data: { channel_id: channelId } }),
    });
  } catch (error) {
    console.error("markChannelRead:", error);
  }
  notifyChatUnreadChanged();
}

export async function fetchUnreadCounts(
  _supabase: SupabaseClient,
  _userId: string,
  channelIds: string[]
): Promise<Record<string, number>> {
  if (!channelIds.length) return {};
  try {
    const { counts } = await neonRequest<{ counts: Record<string, number> }>(
      "/api/neon/chat?mode=unread", { cache: "no-store" }
    );
    return Object.fromEntries(channelIds.map((id) => [id, counts[id] ?? 0]));
  } catch {
    return {};
  }
}
