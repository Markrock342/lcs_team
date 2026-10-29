import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getNeonAuthContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // GIPHY's dedicated web API key is a browser credential, not a server secret.
  // Actual searches go directly from the browser to GIPHY as required by its API.
  const apiKey = process.env.GIPHY_API_KEY?.trim();
  return NextResponse.json({ enabled: !!apiKey, apiKey: apiKey || null }, { headers: { "Cache-Control": "private, no-store" } });
}
