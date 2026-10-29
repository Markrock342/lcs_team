"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { neonRequest } from "@/lib/neon/client";
import { searchGiphy } from "@/lib/chat-giphy";
import type { ChatGif } from "@/lib/chat-gif";

export function ChatOnlineGifSearch({ onPick }: { onPick: (gif: ChatGif) => void }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [config, setConfig] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [query, setQuery] = useState("");
  const [request, setRequest] = useState({ query: "", offset: 0 });
  const [gifs, setGifs] = useState<ChatGif[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configAttempt, setConfigAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void neonRequest<{ enabled: boolean; apiKey: string | null }>("/api/neon/gifs", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: "no-store" })
      .then((data) => { if (!controller.signal.aborted) { setApiKey(data.apiKey); setConfig(data.enabled && data.apiKey ? "ready" : "missing"); } })
      .catch(() => { if (!controller.signal.aborted) setConfig("error"); });
    return () => controller.abort();
  }, [configAttempt]);

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    async function run() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true); setError("");
      if (!request.offset) setGifs([]);
      try {
        const result = await searchGiphy(apiKey!, request.query, request.offset, controller.signal);
        if (controller.signal.aborted) return;
        setGifs((previous) => request.offset ? [...previous, ...result.gifs] : result.gifs);
        setNextOffset(result.nextOffset);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "ค้นหา GIF ไม่สำเร็จ");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void run();
    return () => controller.abort();
  }, [apiKey, request]);

  if (config === "loading") return <p role="status" className="py-6 text-center text-sm text-muted">กำลังเปิดคลัง GIF…</p>;
  if (config === "missing") return <div className="space-y-2 py-4 text-sm leading-relaxed text-muted"><p>ยังไม่ได้เชื่อมคลัง GIF ออนไลน์ กรุณาให้แอดมินตั้งค่าบริการ GIPHY</p><p>ระหว่างนี้เลือกไฟล์จากเครื่อง หรือเปิดแท็บ GIF ในห้องได้</p></div>;
  if (config === "error") return <div className="space-y-3"><p role="alert" className="text-sm text-(--status-red-fg)">เปิดคลัง GIF ไม่สำเร็จ</p><Button type="button" variant="secondary" onClick={() => { setConfig("loading"); setConfigAttempt((attempt) => attempt + 1); }}>ลองอีกครั้ง</Button></div>;

  return <div className="space-y-3">
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setRequest({ query: query.trim(), offset: 0 }); }}>
      <input aria-label="ค้นหา GIF ออนไลน์" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={50} placeholder="ค้นหา GIF เช่น สวัสดี, ขอบคุณ, happy"
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base" />
      <Button type="submit" variant="secondary" disabled={loading} aria-label="ค้นหา GIF"><Search size={18} /></Button>
    </form>
    <p className="text-xs text-muted">{request.query ? `ผลการค้นหา “${request.query}”` : "GIF ยอดนิยม"}</p>
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-(--status-red-fg)">{error}</p><Button type="button" variant="secondary" onClick={() => setRequest({ ...request })}>ลองอีกครั้ง</Button></div>}
    <div className="grid max-h-[40dvh] grid-cols-2 gap-2 overflow-y-auto overscroll-contain" aria-busy={loading}>
      {gifs.map((gif, index) => <button key={`${gif.url}-${index}`} type="button" disabled={loading} onClick={() => onPick(gif)} aria-label={`เลือก GIF ${gif.name}`}
        className="min-w-0 overflow-hidden rounded-lg bg-background text-left focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
        {/* Provider media loads directly, without optimization or rehosting. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gif.previewUrl ?? gif.url} alt={gif.name} loading="lazy" className="h-28 w-full object-contain" />
      </button>)}
    </div>
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" /> กำลังค้นหา GIF…</p>}
    {!loading && !error && !gifs.length && <p className="py-4 text-center text-sm text-muted">ไม่พบ GIF ลองใช้คำค้นอื่น</p>}
    {!loading && !error && nextOffset !== null && <Button type="button" variant="secondary" className="w-full" onClick={() => setRequest({ query: request.query, offset: nextOffset })}>ดูเพิ่มเติม</Button>}
    <a href="https://giphy.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center" aria-label="Powered by GIPHY">
      {/* Official provider attribution, kept unmodified. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/giphy/powered-by-white.png" alt="Powered by GIPHY" width={200} height={42} className="h-auto w-32 rounded bg-white p-1" />
    </a>
  </div>;
}
