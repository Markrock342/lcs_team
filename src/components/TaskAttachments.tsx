"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Download, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile, isImageFile, isTextPreviewFile, normalizeStoredFileType, downloadFile } from "@/lib/upload";
import { useRole } from "@/components/RoleProvider";
import { TextFilePreviewModal } from "@/components/TextFilePreviewModal";
import type { TaskAttachment } from "@/lib/types";

type Props = {
  taskId: string;
  currentUserId?: string;
  compact?: boolean;
  onChange?: () => void;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId, currentUserId, compact, onChange }: Props) {
  const { canEdit } = useRole();
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dbError, setDbError] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const [textPreview, setTextPreview] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [taskId]);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("task_attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error?.message.includes("relation") || error?.message.includes("does not exist")) {
      setDbError("รัน supabase/add-task-attachments.sql");
      setLoading(false);
      return;
    }
    setItems((data ?? []) as TaskAttachment[]);
    setLoading(false);
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setError("");
    setUploading(true);
    const supabase = createClient();
    const added: TaskAttachment[] = [];

    for (const file of list) {
      const uploaded = await uploadFile(file, "tasks");
      if (!uploaded.ok) {
        setError(uploaded.error);
        continue;
      }
      const { data, error } = await supabase
        .from("task_attachments")
        .insert({
          task_id: taskId,
          file_url: uploaded.url,
          file_name: file.name,
          file_type: normalizeStoredFileType(file),
          file_size: file.size,
          uploaded_by: currentUserId ?? null,
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes("relation") || error.message.includes("does not exist")) {
          setDbError("รัน supabase/add-task-attachments.sql");
        } else {
          setError(error.message);
        }
        continue;
      }
      if (data) added.push(data as TaskAttachment);
    }

    if (added.length) {
      setItems((prev) => [...added, ...prev]);
      onChange?.();
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function removeItem(id: string) {
    const supabase = createClient();
    await supabase.from("task_attachments").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    onChange?.();
  }

  function onPaste(e: React.ClipboardEvent) {
    if (!canEdit) return;
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) {
      e.preventDefault();
      handleFiles(files);
    }
  }

  async function handleDownload(att: TaskAttachment) {
    setDownloadingId(att.id);
    try {
      await downloadFile(att.file_url, att.file_name);
    } catch {
      setError("ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-2" onPaste={onPaste}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted flex items-center gap-1.5">
          <Paperclip size={12} /> ไฟล์แนบ{items.length > 0 ? ` (${items.length})` : ""}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-xs text-accent hover:text-accent-dim font-medium flex items-center gap-1 disabled:opacity-50 touch-manipulation"
          >
            {uploading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Paperclip size={13} />
            )}
            แนบไฟล์
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {dbError && <p className="text-xs text-amber-400">{dbError}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {items.length > 0 && (
        <div className={compact ? "flex flex-wrap gap-2" : "space-y-1"}>
          {items.map((att) => {
            const image = isImageFile(att.file_type);
            const textFile = isTextPreviewFile(att.file_name, att.file_type);
            return (
              <div
                key={att.id}
                className="group flex items-center gap-2 p-1.5 pr-2 rounded-lg bg-background border border-border max-w-full"
              >
                {image ? (
                  <button
                    type="button"
                    onClick={() => setPreview(att)}
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={att.file_url}
                      alt={att.file_name}
                      className="w-9 h-9 rounded object-cover"
                    />
                  </button>
                ) : textFile ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTextPreview({ url: att.file_url, name: att.file_name })
                    }
                    className="w-9 h-9 rounded bg-accent/10 flex items-center justify-center shrink-0 hover:bg-accent/20"
                  >
                    <FileText size={16} className="text-accent" />
                  </button>
                ) : (
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded bg-accent/10 flex items-center justify-center shrink-0"
                  >
                    <FileText size={16} className="text-accent" />
                  </a>
                )}
                {textFile ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTextPreview({ url: att.file_url, name: att.file_name })
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-xs truncate max-w-36 hover:text-accent">
                      {att.file_name}
                    </p>
                    {att.file_size ? (
                      <p className="text-[10px] text-muted">
                        {formatSize(att.file_size)}
                      </p>
                    ) : null}
                  </button>
                ) : (
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1"
                  >
                    <p className="text-xs truncate max-w-36 hover:text-accent">
                      {att.file_name}
                    </p>
                    {att.file_size ? (
                      <p className="text-[10px] text-muted">
                        {formatSize(att.file_size)}
                      </p>
                    ) : null}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleDownload(att)}
                  disabled={downloadingId === att.id}
                  className="p-1 rounded text-muted hover:text-accent touch-manipulation shrink-0 disabled:opacity-50"
                  title="ดาวน์โหลด"
                >
                  {downloadingId === att.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeItem(att.id)}
                    className="p-1 rounded text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 touch-manipulation shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                await handleDownload(preview);
              }}
              disabled={downloadingId === preview.id}
              className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
              title="ดาวน์โหลด"
            >
              {downloadingId === preview.id ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Download size={20} />
              )}
            </button>
            <button
              type="button"
              className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setPreview(null)}
            >
              <X size={20} />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.file_url}
            alt={preview.file_name}
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <TextFilePreviewModal
        open={!!textPreview}
        onClose={() => setTextPreview(null)}
        fileUrl={textPreview?.url ?? ""}
        fileName={textPreview?.name ?? ""}
      />
    </div>
  );
}
