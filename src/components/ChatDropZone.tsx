"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { UploadCloud } from "lucide-react";

export function ChatDropZone({ children, className, disabled = false, onFiles, onError }: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onError: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

  return <div className={className}
    onDragEnter={(event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (!disabled) setDragging(true);
    }}
    onDragOver={(event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    }}
    onDragLeave={(event) => {
      if (!isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    }}
    onDrop={(event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setDragging(false);
      if (disabled) return;
      if (Array.from(event.dataTransfer.items).some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
        onError("ยังแนบโฟลเดอร์ไม่ได้ กรุณาเลือกไฟล์หรือบีบอัดเป็น ZIP ก่อน");
        return;
      }
      onFiles(Array.from(event.dataTransfer.files));
    }}>
    {children}
    {dragging && !disabled && <div role="status" className="pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-card/95 p-6 text-center">
      <UploadCloud size={36} className="text-accent" />
      <p className="text-lg font-semibold">วางไฟล์เพื่อแนบในแชท</p>
      <p className="text-sm text-muted">ครั้งละ 1 ไฟล์ · สูงสุด 50 MB</p>
      <p className="text-xs text-muted">ตรวจไฟล์ก่อน แล้วกดส่งได้เลย</p>
    </div>}
  </div>;
}
