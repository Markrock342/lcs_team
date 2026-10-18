import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getNeonHealthSnapshot,
  isNeonConfigured,
} from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase auth is not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isNeonConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "DATABASE_URL is not configured on this server",
      },
      { status: 503 }
    );
  }

  try {
    const snapshot = await getNeonHealthSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Neon connection failed",
      },
      { status: 503 }
    );
  }
}
