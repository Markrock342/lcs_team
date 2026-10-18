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


/** The authenticated user's JWT is forwarded by auth.ts: no Service Role or bypass-RLS client. */
export function taskWriteOperations(db: SupabaseClient, actorId: string) {
  return {
    async create_task({
      title, description, priority, client_id, assigned_to, due_date,
    }: {
      title: string;
      description?: string;
      priority: "low" | "medium" | "high" | "urgent";
      client_id?: string;
      assigned_to?: string;
      due_date?: string;
    }) {
      // Validate referenced rows using the caller's RLS-scoped client.
      if (client_id) {
        const { data, error } = await db.from("clients").select("id").eq("id", client_id).maybeSingle();
        if (error || !data) throw Error("Client not accessible");
      }
      if (assigned_to) {
        const { data, error } = await db.from("profiles").select("id").eq("id", assigned_to).maybeSingle();
        if (error || !data) throw Error("Assignee not accessible");
      }
      // Only allowlisted fields; status/progress and authorship are server-controlled.
      const { data, error } = await db.from("tasks").insert({
        title, description: description || null, priority,
        client_id: client_id ?? null, assigned_to: assigned_to ?? null,
        due_date: due_date ?? null, created_by: actorId,
        status: "pending", progress: 0,
      }).select("id, title, status, priority, client_id, assigned_to, due_date, created_by").single();
      if (error || !data) throw Error("Insert failed");
      return { task: data };
    },
  };
}
