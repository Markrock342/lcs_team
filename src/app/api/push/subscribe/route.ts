import { createClient } from "@/lib/supabase/server";
import { withNeonTransaction } from "@/lib/neon/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sub = await request.json();

  await withNeonTransaction(async (client) => {
    await client.query(
      `INSERT INTO public.push_subscriptions (user_id,endpoint,p256dh,auth)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id,endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
      [user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
    );
    await client.query(`UPDATE public.profiles SET push_enabled=TRUE WHERE id=$1`, [user.id]);
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await withNeonTransaction(async (client) => {
    await client.query(`DELETE FROM public.push_subscriptions WHERE user_id=$1`, [user.id]);
    await client.query(`UPDATE public.profiles SET push_enabled=FALSE WHERE id=$1`, [user.id]);
  });

  return NextResponse.json({ ok: true });
}
