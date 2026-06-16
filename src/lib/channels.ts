export function slugifyChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-\u0E00-\u0E7F]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function formatChannelDisplay(name: string): string {
  return `#${name}`;
}

export function chatChannelHref(channelId: string): string {
  return `/chat?channel=${encodeURIComponent(channelId)}`;
}

export function getChatChannelIdFromLink(link: string | null | undefined): string | null {
  if (!link?.startsWith("/chat")) return null;
  try {
    return new URL(link, "http://local").searchParams.get("channel");
  } catch {
    return null;
  }
}

export function resolveChannelFromParam<T extends { id: string; name: string }>(
  param: string | null,
  channels: T[]
): T | null {
  if (!param) return null;
  return (
    channels.find((c) => c.id === param) ??
    channels.find((c) => c.name === param) ??
    null
  );
}
