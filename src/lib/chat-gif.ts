export type ChatGif = { url: string; name: string; previewUrl?: string; provider?: "giphy" };

type GifMessage = {
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  deleted_at?: string | null;
};

export function isChatGif(type?: string | null, name?: string | null): boolean {
  if (type?.split(";")[0].trim().toLowerCase() === "image/gif") return true;
  return (!type || type === "application/octet-stream") && /\.gif$/i.test(name ?? "");
}

/** Only attachments already visible in this conversation are offered for reuse. */
export function recentChatGifs(messages: readonly GifMessage[]): ChatGif[] {
  const seen = new Set<string>();
  const result: ChatGif[] = [];
  for (const message of [...messages].reverse()) {
    if (message.deleted_at || !message.file_url || !isChatGif(message.file_type, message.file_name)) continue;
    if (/^https:\/\/(?:media\d*|i)\.giphy\.com\//i.test(message.file_url)) continue;
    if (seen.has(message.file_url)) continue;
    seen.add(message.file_url);
    result.push({ url: message.file_url, name: message.file_name || "animation.gif" });
    if (result.length === 40) break;
  }
  return result;
}
