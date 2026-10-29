import type { ChatGif } from "./chat-gif";

type GiphyItem = { id: string; title?: string; images?: Record<string, { url?: string }> };

function mediaUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^(?:media\d*|i)\.giphy\.com$/i.test(url.hostname) ? value : null;
  } catch { return null; }
}

/** Direct browser requests are required by the provider. No search results are persisted. */
export async function searchGiphy(apiKey: string, query: string, offset: number, signal: AbortSignal): Promise<{ gifs: ChatGif[]; nextOffset: number | null }> {
  const url = new URL(`https://api.giphy.com/v1/gifs/${query ? "search" : "trending"}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", "20");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("rating", "pg");
  if (query) { url.searchParams.set("q", query); url.searchParams.set("lang", /[\u0e00-\u0e7f]/.test(query) ? "th" : "en"); }
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("เชื่อมต่อคลัง GIF ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง");
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("ค้นหา GIF เกินโควตาของบริการ กรุณารอสักครู่แล้วลองใหม่");
    if (response.status === 401 || response.status === 403) throw new Error("ยังเชื่อมคลัง GIF ไม่สำเร็จ กรุณาแจ้งแอดมินตรวจคีย์ GIPHY");
    throw new Error("ค้นหา GIF ไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  const payload = await response.json() as { data?: GiphyItem[]; pagination?: { total_count: number; count: number; offset: number } };
  if (!Array.isArray(payload.data)) throw new Error("คลัง GIF ตอบกลับไม่สมบูรณ์ กรุณาลองอีกครั้ง");
  const gifs = payload.data.flatMap((item) => {
    const original = mediaUrl(item.images?.downsized?.url ?? item.images?.original?.url);
    if (!original) return [];
    return [{ url: original, previewUrl: mediaUrl(item.images?.fixed_width_small?.url) ?? original,
      name: `${(item.title || "GIF").replace(/[\/\\\u0000-\u001f]/g, " ").slice(0, 80)}.gif`, provider: "giphy" as const }];
  });
  const next = payload.pagination ? payload.pagination.offset + payload.pagination.count : offset + payload.data.length;
  return { gifs, nextOffset: payload.pagination && next < payload.pagination.total_count && payload.data.length ? next : null };
}
