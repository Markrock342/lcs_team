import { createClient } from "@/lib/supabase/client";

export async function uploadFile(
  file: File,
  folder: "clients" | "tasks" | "chat" | "client-files",
  signal?: AbortSignal
): Promise<{ url: string; path: string } | null> {
  const supabase = createClient();
  const ext =
    file.name.includes(".")
      ? file.name.split(".").pop()
      : file.type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from("uploads").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (signal?.aborted) return null;

  if (error) {
    console.error("Upload error:", error);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("uploads").getPublicUrl(path);

  return { url: publicUrl, path };
}

export function isImageFile(type: string | null | undefined): boolean {
  return !!type?.startsWith("image/");
}
