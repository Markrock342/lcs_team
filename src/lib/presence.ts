import { format, isToday, isYesterday } from "date-fns";
import { th } from "date-fns/locale";

/** ถือว่าออนไลน์ถ้า heartbeat ภายใน 3 นาที */
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "ยังไม่เคยออนไลน์";

  const d = new Date(lastSeenAt);
  if (Number.isNaN(d.getTime())) return "ยังไม่เคยออนไลน์";

  const diffMs = Date.now() - d.getTime();
  if (diffMs < ONLINE_THRESHOLD_MS) return "ออนไลน์";
  if (diffMs < 60 * 1000) return "ออฟไลน์ · เมื่อสักครู่";
  if (isToday(d)) return `ออฟไลน์ · วันนี้ ${format(d, "HH:mm", { locale: th })}`;
  if (isYesterday(d)) return `ออฟไลน์ · เมื่อวาน ${format(d, "HH:mm", { locale: th })}`;
  return `ออฟไลน์ · ${format(d, "d MMM HH:mm", { locale: th })}`;
}

export function formatPresenceStatus(lastSeenAt: string | null | undefined): string {
  if (isOnline(lastSeenAt)) return "ออนไลน์";
  return formatLastSeen(lastSeenAt);
}
