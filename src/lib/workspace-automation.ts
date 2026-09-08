import { createClient } from "@/lib/supabase/client";
import { sendNotification, sendNotifications } from "@/lib/notifications";
import { logActivity } from "@/lib/activity";
import type { Client, SalesDeal, SalesProspect } from "@/lib/types";

export async function convertProspectToDeal(prospect: SalesProspect) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: deal, error } = await supabase
    .from("sales_deals")
    .insert({
      title: prospect.name,
      company: prospect.company,
      contact_name: prospect.contact_name,
      contact_phone: prospect.contact_phone,
      contact_email: prospect.contact_email,
      stage: "talking",
      owner_id: prospect.owner_id ?? user?.id ?? null,
      notes: prospect.notes,
      next_follow_up: prospect.next_follow_up,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error || !deal) {
    return { error: error?.message ?? "สร้างดีลไม่สำเร็จ" };
  }

  await supabase
    .from("sales_prospects")
    .update({
      status: "converted",
      deal_id: deal.id,
    })
    .eq("id", prospect.id);

  await logActivity("create", "sales_deal", deal.id, prospect.name, {
    from: "prospect",
    prospect_id: prospect.id,
  });

  return { deal: deal as SalesDeal };
}

export async function createClientFromWonDeal(deal: SalesDeal) {
  if (deal.client_id) return { clientId: deal.client_id };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      name: deal.title,
      company: deal.company,
      contact_name: deal.contact_name,
      contact_phone: deal.contact_phone,
      contact_email: deal.contact_email,
      project_type: "system",
      description: deal.notes,
      status: "lead",
      created_by: user?.id ?? null,
    })
    .select("id, name")
    .single();

  if (error || !client) {
    return { error: error?.message ?? "สร้างลูกค้าไม่สำเร็จ" };
  }

  await supabase.from("sales_deals").update({ client_id: client.id }).eq("id", deal.id);
  await supabase
    .from("sales_prospects")
    .update({ client_id: client.id })
    .eq("deal_id", deal.id);

  await supabase.from("tasks").insert({
    title: `เริ่มโปรเจกต์: ${deal.title}`,
    description: deal.notes,
    client_id: client.id,
    status: "pending",
    priority: "medium",
    assigned_to: deal.owner_id,
    created_by: user?.id ?? null,
    duration_days: 1,
    progress: 0,
  });

  await logActivity("create", "client", client.id, client.name, { from: "won_deal" });
  return { clientId: client.id as string, client: client as Pick<Client, "id" | "name"> };
}

export async function notifyTaskCompleted(task: {
  id: string;
  title: string;
  assigned_to?: string | null;
  created_by?: string | null;
  client_id?: string | null;
}) {
  const supabase = createClient();
  const { data: pms } = await supabase
    .from("profiles")
    .select("id, role")
    .in("role", ["admin", "pm"]);

  const recipients = new Set<string>();
  for (const profile of pms ?? []) recipients.add(profile.id);
  if (task.created_by) recipients.add(task.created_by);
  if (task.assigned_to) recipients.delete(task.assigned_to);

  await sendNotifications(
    [...recipients].map((userId) => ({
      userId,
      title: "งานเสร็จแล้ว",
      body: task.title,
      link: "/tasks",
      sourceType: "task_done",
      sourceId: task.id,
      kind: "task",
    }))
  );
}

export async function notifyOwner(userId: string | null, title: string, body: string, link: string, sourceType: string, sourceId: string, kind: "sales" | "invoice" | "task" | "system" = "system") {
  if (!userId) return;
  await sendNotification({
    userId,
    title,
    body,
    link,
    sourceType,
    sourceId,
    kind,
  });
}
