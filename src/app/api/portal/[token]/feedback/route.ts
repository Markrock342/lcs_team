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
  const taskId = String(body.task_id ?? "");
  const status = String(body.status ?? "comment");
  const comment = body.comment ? String(body.comment).trim() : null;

  if (!authorName || !taskId) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  if (!["approved", "changes_requested", "comment"].includes(status)) {
    return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: feedbackId, error } = await supabase.rpc(
    "post_portal_task_feedback",
    {
      token,
      p_task_id: taskId,
      author_name: authorName,
      p_status: status,
      p_comment: comment,
    }
  );

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

    const statusLabel =
      status === "approved"
        ? "อนุมัติ"
        : status === "changes_requested"
          ? "ขอแก้ไข"
          : "แสดงความคิดเห็น";

    if (client) {
      const { data: profiles } = await admin.from("profiles").select("id");
      const notifications = (profiles ?? []).map((p) => ({
        userId: p.id,
        title: `✅ ลูกค้า${statusLabel}งาน`,
        body: `${authorName} — ${comment?.slice(0, 60) ?? statusLabel}`,
        link: `/clients/${client.id}`,
        sourceType: "portal_feedback",
        sourceId: feedbackId as string,
        kind: "system" as const,
      }));
      await deliverNotifications(admin, notifications);
    }
  }

  return NextResponse.json({ id: feedbackId });
}
