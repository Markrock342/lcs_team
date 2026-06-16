export async function downloadChatFile(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || "download";
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export function getReadReceiptNames(
  reads: { user_id: string; reader?: { display_name: string } | null }[] | undefined,
  senderId: string,
  profiles: { id: string; display_name: string }[]
): string[] {
  if (!reads?.length) return [];
  return reads
    .filter((r) => r.user_id !== senderId)
    .map(
      (r) =>
        r.reader?.display_name ??
        profiles.find((p) => p.id === r.user_id)?.display_name ??
        "?"
    );
}
