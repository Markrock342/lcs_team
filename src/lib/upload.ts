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
};

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
    contentType: file.type || undefined,
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
