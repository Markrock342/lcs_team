"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, ExternalLink, ImageOff, Minus, Plus, X } from "lucide-react";
import { downloadChatFile } from "@/lib/chat";

export function ChatImageViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  async function download() {
    setDownloading(true);
    setError("");
    try { await downloadChatFile(src, name); }
    catch { setError("ดาวน์โหลดไม่สำเร็จ ลองอีกครั้งหรือเปิดไฟล์ต้นฉบับ"); }
    finally { setDownloading(false); }
  }

  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="m-auto h-dvh w-screen max-h-none max-w-none overflow-hidden border-0 bg-card p-0 text-foreground backdrop:bg-black/75 sm:h-[90dvh] sm:w-[92vw] sm:rounded-2xl sm:border sm:border-border lg:max-w-7xl">
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 pt-safe sm:px-5">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</h2>
        <a href={src} target="_blank" rel="noopener noreferrer" aria-label="เปิดไฟล์ต้นฉบับ" title="เปิดไฟล์ต้นฉบับ" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-card-hover"><ExternalLink size={18} /></a>
        <button type="button" onClick={download} disabled={downloading} aria-label="ดาวน์โหลดรูป" title="ดาวน์โหลดรูป" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-card-hover disabled:opacity-50"><Download size={18} /></button>
        <button type="button" onClick={onClose} aria-label="ปิดรูปภาพ" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-card-hover"><X size={20} /></button>
      </header>
      {error && <p role="alert" className="bg-(--status-red-bg) px-4 py-2 text-sm text-(--status-red-fg)">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-background" aria-label="ภาพขยาย">
        {failed ? <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted">
          <ImageOff size={32} /><p>โหลดรูปไม่สำเร็จ</p>
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent underline">เปิดไฟล์ต้นฉบับ</a>
        </div> : <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} className="p-3 sm:p-6">
          {/* Show the original upload so diagrams and text remain sharp while zooming. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name} onError={() => setFailed(true)} onDoubleClick={() => setZoom(zoom === 1 ? 2 : 1)}
            className={`h-full w-full object-contain ${zoom === 1 ? "cursor-zoom-in" : "cursor-zoom-out"}`} />
        </div>}
      </div>
      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-border px-3 py-2 pb-safe">
        <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom === 1 || failed} aria-label="ย่อรูป" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-card-hover disabled:opacity-40"><Minus size={18} /></button>
        <span aria-live="polite" className="min-w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.5))} disabled={zoom === 3 || failed} aria-label="ขยายรูป" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-card-hover disabled:opacity-40"><Plus size={18} /></button>
        <button type="button" onClick={() => setZoom(1)} className="min-h-11 rounded-lg px-3 text-sm text-accent hover:bg-card-hover">พอดีหน้าต่าง</button>
      </footer>
    </div>
  </dialog>;
}
