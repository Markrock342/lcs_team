import type { SupabaseClient } from "@supabase/supabase-js";
export function readOperations(db: SupabaseClient) {
  return {
    async list_clients({ limit }: { limit: number }) {
      const { data, error } = await db.from("clients")
        .select("id, name, company, status, project_type, updated_at")
        .order("updated_at", { ascending: false }).limit(limit);
      if (error) throw Error("Query failed");
      return { clients: data ?? [] };
    },
    async list_tasks({ limit, status }: { limit: number; status?: string }) {
      let query = db.from("tasks")
        .select("id, client_id, title, status, priority, assigned_to, due_date, progress, updated_at")
        .order("updated_at", { ascending: false }).limit(limit);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw Error("Query failed");
      return { tasks: data ?? [] };
    },
    async get_workspace_summary() {
      const today = new Date().toISOString().slice(0, 10);
      const [clients, open, overdue] = await Promise.all([
        db.from("clients").select("id", { count: "exact", head: true }),
        db.from("tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
        db.from("tasks").select("id", { count: "exact", head: true }).neq("status", "done").lt("due_date", today),
      ]);
      if (clients.error || open.error || overdue.error) throw Error("Query failed");
      return { clients: clients.count, open_tasks: open.count, overdue_tasks: overdue.count, as_of: today };
    },
  };
}
