import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("get_portal_data", {
    token,
  });

  if (error || !data) {
    return NextResponse.json({ error: "Invalid or disabled portal" }, { status: 404 });
  }

  return NextResponse.json(data);
}
