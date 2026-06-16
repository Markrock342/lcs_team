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
