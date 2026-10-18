import { neonRequest } from "@/lib/neon/client";
import type { SavedView } from "@/lib/extras-types";

const LAST_FILTER_KEY = "lcs-last-filters";

export const PRESET_VIEWS: Record<SavedView["page"], Array<{ name: string; filters: Record<string, string> }>> = {
  tasks: [
    { name: "งานของฉัน", filters: { assignee: "me", status: "active" } },
    { name: "งานด่วน", filters: { priority: "urgent", status: "active" } },
  ],
  clients: [
    { name: "ลูกค้าที่ต้องตาม", filters: { status: "active" } },
    { name: "ลูกค้าใหม่", filters: { status: "lead" } },
  ],
  sales: [
    { name: "ติดตามวันนี้", filters: { view: "today" } },
    { name: "รายชื่อยังไม่คัด", filters: { view: "prospects", status: "new" } },
  ],
  finance: [
    { name: "เงินค้างรับ", filters: { tab: "receivable" } },
  ],
};

export function readLastFilters(page: SavedView["page"]): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${LAST_FILTER_KEY}:${page}`);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeLastFilters(page: SavedView["page"], filters: Record<string, string>) {
  localStorage.setItem(`${LAST_FILTER_KEY}:${page}`, JSON.stringify(filters));
}

export async function loadSavedViews(page: SavedView["page"]) {
  const { views } = await neonRequest<{ views: SavedView[] }>(
    `/api/neon/saved-views?page=${encodeURIComponent(page)}`,
    { cache: "no-store" },
  );
  return views;
}

export async function saveView(page: SavedView["page"], name: string, filters: Record<string, string>) {
  try {
    const { view } = await neonRequest<{ view: SavedView }>("/api/neon/saved-views", {
      method: "POST",
      body: JSON.stringify({ page, name, filters }),
    });
    return { view, error: undefined };
  } catch (error) {
    return { view: null, error: error instanceof Error ? error.message : "บันทึกมุมมองไม่สำเร็จ" };
  }
}

export async function deleteSavedView(id: string) {
  await neonRequest("/api/neon/saved-views", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}
