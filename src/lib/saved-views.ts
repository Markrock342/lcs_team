import { createClient } from "@/lib/supabase/client";
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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [] as SavedView[];
  const { data } = await supabase
    .from("saved_views")
    .select("*")
    .eq("user_id", user.id)
    .eq("page", page)
    .order("created_at", { ascending: true });
  return (data ?? []) as SavedView[];
}

export async function saveView(page: SavedView["page"], name: string, filters: Record<string, string>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "ยังไม่ได้เข้าสู่ระบบ" };
  const { data, error } = await supabase
    .from("saved_views")
    .insert({
      user_id: user.id,
      page,
      name,
      filters,
    })
    .select("*")
    .single();
  return { view: data as SavedView | null, error: error?.message };
}

export async function deleteSavedView(id: string) {
  const supabase = createClient();
  await supabase.from("saved_views").delete().eq("id", id);
}
