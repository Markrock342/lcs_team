import { createClient } from "@/lib/supabase/client";

export type UploadResult =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string };

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/plain": "txt",
};

/** MIME สำหรับไฟล์ข้อความ — ใส่ charset=utf-8 เพื่อให้เปิดแล้วอ่านไทยได้ */
const EXT_CONTENT_TYPE: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  log: "text/plain; charset=utf-8",
  sql: "text/plain; charset=utf-8",
};

export function resolveUploadContentType(file: File): string | undefined {
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : null;
  if (ext && EXT_CONTENT_TYPE[ext]) return EXT_CONTENT_TYPE[ext];
  if (file.type?.startsWith("text/")) {
    return file.type.includes("charset")
      ? file.type
      : `${file.type}; charset=utf-8`;
  }
  if (file.type === "application/json") {
    return "application/json; charset=utf-8";
  }
  return file.type || undefined;
}

/** เก็บใน DB — ไม่มี charset suffix */
export function normalizeStoredFileType(file: File): string | null {
  const resolved = resolveUploadContentType(file);
  if (!resolved) return file.type || null;
  return resolved.split(";")[0].trim() || null;
}

export function isTextPreviewFile(
  fileName: string,
  fileType?: string | null
): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (
    ext &&
    ["md", "markdown", "txt", "json", "csv", "log", "sql"].includes(ext)
  ) {
    return true;
  }
  if (fileType?.startsWith("text/")) return true;
  if (fileType === "application/json") return true;
  return false;
}

function fileExtension(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : null;
  if (fromName && fromName.length <= 5) {
    return fromName.replace("jpeg", "jpg");
  }
  if (file.type && MIME_EXT[file.type]) return MIME_EXT[file.type];
  if (file.type.includes("/")) {
    return file.type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  }
  return "bin";
}

export async function uploadFile(
  file: File,
  folder:
    | "clients"
    | "tasks"
    | "chat"
    | "client-files"
    | "avatars"
    | "payouts"
    | "accounting",
  signal?: AbortSignal
): Promise<UploadResult> {
  const supabase = createClient();
  const ext = fileExtension(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from("uploads").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: resolveUploadContentType(file),
  });

  if (signal?.aborted) {
    return { ok: false, error: "ยกเลิกการอัปโหลด" };
  }

  if (error) {
    console.error("Upload error:", error);
    const msg = error.message.toLowerCase();
    if (msg.includes("bucket") || msg.includes("not found")) {
      return { ok: false, error: "ยังไม่ได้ตั้งค่า Storage — รัน supabase/storage-uploads.sql" };
    }
    if (msg.includes("policy") || msg.includes("permission") || msg.includes("row-level")) {
      return { ok: false, error: "ไม่มีสิทธิ์อัปโหลด — ลองล็อกอินใหม่" };
    }
    if (msg.includes("size") || msg.includes("large")) {
      return { ok: false, error: "ไฟล์ใหญ่เกินไป (สูงสุด 50 MB)" };
    }
    return { ok: false, error: `อัปโหลดไม่สำเร็จ: ${error.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("uploads").getPublicUrl(path);

  return { ok: true, url: publicUrl, path };
}

export function isImageFile(type: string | null | undefined): boolean {
  return !!type?.startsWith("image/");
}

/** ดาวน์โหลดไฟล์จาก URL พร้อมชื่อไฟล์ */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("ดาวน์โหลดไม่สำเร็จ");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
