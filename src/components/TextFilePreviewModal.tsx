"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
};

export function TextFilePreviewModal({
  open,
  onClose,
  fileUrl,
  fileName,
}: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !fileUrl) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setContent("");

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`โหลดไม่สำเร็จ (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "โหลดไฟล์ไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, fileUrl]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-3xl flex flex-col max-h-full bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <p className="flex-1 font-medium text-sm truncate">{fileName}</p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-muted hover:text-accent hover:bg-card-hover"
            title="เปิดในแท็บใหม่"
          >
            <ExternalLink size={16} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-card-hover"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400 text-center py-8">{error}</p>
          )}
          {!loading && !error && (
            <pre className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground font-mono">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
