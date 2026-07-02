import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deliverNotifications } from "@/lib/notification-server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json();
  const authorName = String(body.author_name ?? "").trim();
  const content = String(body.content ?? "").trim();
  const taskId = body.task_id ?? null;

  if (!authorName || !content) {
    return NextResponse.json({ error: "กรอกชื่อและข้อความ" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: commentId, error } = await supabase.rpc("post_portal_comment", {
    token,
    author_name: authorName,
    content,
    p_task_id: taskId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  if (admin) {
    const { data: client } = await admin
      .from("clients")
      .select("id, name")
      .eq("portal_token", token)
      .single();

    if (client) {
      const { data: profiles } = await admin.from("profiles").select("id");
      const notifications = (profiles ?? []).map((p) => ({
        userId: p.id,
        title: "💬 ลูกค้าตอบใน Portal",
        body: `${authorName} (${client.name}): ${content.slice(0, 80)}`,
        link: `/clients/${client.id}`,
        sourceType: "portal_comment",
        sourceId: commentId as string,
        kind: "system" as const,
      }));
      await deliverNotifications(admin, notifications);
    }
  }

  return NextResponse.json({ id: commentId });
}
