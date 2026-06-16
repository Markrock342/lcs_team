import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push-server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (!subs?.length) {
    return NextResponse.json(
      { error: "ยังไม่ได้เปิด Push — กดเปิดใน Settings ก่อน" },
      { status: 400 }
    );
  }

  await sendPushToUser(subs, {
    title: "Limit Code Studio",
    body: "ทดสอบ Push — ถ้าเห็นข้อความนี้ แจ้งเตือนทำงานแล้ว",
    link: "/notifications",
  });

  return NextResponse.json({ ok: true });
}
