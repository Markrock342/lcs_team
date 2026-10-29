"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { ChatOnlineGifSearch } from "@/components/ChatOnlineGifSearch";
import { Modal, Input } from "@/components/ui";
import { chatAttachmentError } from "@/lib/chat-attachments";
import { type ChatGif, isChatGif } from "@/lib/chat-gif";

export function ChatGifPicker({ gifs, onPick, onPickRemote, onClose }: {
  gifs: ChatGif[];
  onPick: (file: File) => void;
  onPickRemote?: (gif: ChatGif) => void;
  onClose: () => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<"online" | "room">("online");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => pending.current?.abort(), []);

  function pick(file: File) {
    const validation = chatAttachmentError([file]);
    if (validation) { setError(validation); return; }
    if (!isChatGif(file.type, file.name)) { setError("กรุณาเลือกไฟล์ .gif"); return; }
    onPick(new File([file], file.name, { type: "image/gif", lastModified: file.lastModified }));
    onClose();
  }

  async function reuse(gif: ChatGif) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(gif.url);
    setError("");
    try {
      const response = await fetch(gif.url, { signal: controller.signal });
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const header = new TextDecoder().decode(await blob.slice(0, 6).arrayBuffer());
      if (header !== "GIF87a" && header !== "GIF89a") throw new Error("invalid gif");
      if (controller.signal.aborted) return;
      pick(new File([blob], gif.name, { type: "image/gif" }));
    } catch {
      if (!controller.signal.aborted) setError("โหลด GIF ไม่สำเร็จ ลองอีกครั้งหรือเลือกไฟล์จากเครื่อง");
    } finally {
      if (!controller.signal.aborted) { setLoading(null); pending.current = null; }
    }
  }

  const filtered = gifs.filter((gif) => gif.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Modal open onClose={onClose} title="เลือก GIF">
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">ค้นหา GIF ออนไลน์ เลือกจากห้อง หรืออัปโหลดไฟล์ใหม่ แล้วกดส่งในช่องแชท</p>
      <input ref={upload} type="file" accept="image/gif,.gif" className="hidden" disabled={!!loading}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) pick(file); }} />
      <button type="button" disabled={!!loading} onClick={() => upload.current?.click()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-card-hover disabled:opacity-50">
        <Upload size={18} /> เลือก GIF จากเครื่อง
      </button>
      <div className="flex gap-2 border-b border-border pb-2" role="group" aria-label="แหล่ง GIF">
        <button type="button" aria-pressed={tab === "online"} onClick={() => setTab("online")} className={`min-h-11 rounded-xl px-3 text-sm ${tab === "online" ? "bg-accent/15 font-semibold text-accent" : "text-muted hover:bg-card-hover"}`}>ค้นหาออนไลน์</button>
        <button type="button" aria-pressed={tab === "room"} onClick={() => setTab("room")} className={`min-h-11 rounded-xl px-3 text-sm ${tab === "room" ? "bg-accent/15 font-semibold text-accent" : "text-muted hover:bg-card-hover"}`}>GIF ในห้อง</button>
      </div>
      {tab === "online" && error && <p role="alert" className="text-sm text-(--status-red-fg)">{error}</p>}
      {tab === "online" && <ChatOnlineGifSearch onPick={(gif) => { onPickRemote?.(gif); onClose(); }} />}
      {tab === "room" && <>
      {error && <p role="alert" className="text-sm text-(--status-red-fg)">{error}</p>}
      {gifs.length > 0 && <Input aria-label="ค้นหา GIF ในห้องนี้" placeholder="ค้นหาจากชื่อไฟล์" value={query} onChange={(event) => setQuery(event.target.value)} />}
      <div aria-busy={!!loading}>
        {loading && <p role="status" className="mb-3 flex items-center gap-2 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" /> กำลังเตรียม GIF…</p>}
        {filtered.length ? <div className="grid max-h-[40dvh] grid-cols-2 gap-3 overflow-y-auto overscroll-contain">
          {filtered.map((gif) => <button key={gif.url} type="button" disabled={!!loading} onClick={() => void reuse(gif)}
            aria-label={`เลือก GIF ${gif.name}`} className="min-w-0 overflow-hidden rounded-xl border border-border bg-background text-left hover:border-accent disabled:opacity-50">
            {/* Keep the original GIF so animation is preserved. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gif.url} alt={gif.name} loading="lazy" className="h-28 w-full object-contain" />
            <span className="block truncate px-3 py-2 text-xs text-muted">{gif.name}</span>
          </button>)}
        </div> : <p className="py-6 text-center text-sm leading-relaxed text-muted">{gifs.length ? "ไม่พบ GIF ตามชื่อนี้" : "ยังไม่มี GIF ในห้องนี้ เริ่มจากเลือกไฟล์ .gif จากเครื่อง หรือลากไฟล์มาวางในแชท"}</p>}
      </div>
      </>}
    </div>
  </Modal>;
}
