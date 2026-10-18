import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import { validateMcpClaims } from "./claims.mjs";

type AuthResult = { ok: true; db: SupabaseClient; userId: string; role: "admin" | "pm" } | { ok: false; response: Response };
function deny(status: number, message: string): AuthResult {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (status === 401) headers.set("WWW-Authenticate", 'Bearer realm="LCS Team MCP"');
  return { ok: false, response: Response.json({ error: message }, { status, headers }) };
}
export async function authenticateMcp(request: Request): Promise<AuthResult> {
  const env = getSupabaseEnv();
  const clientId = process.env.LCS_MCP_OAUTH_CLIENT_ID?.trim();
  if (!env || !clientId) return deny(503, "MCP is not configured");
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) return deny(401, "Bearer token required");
  const token = match[1];
  const db = createClient(env.url, env.key, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let userId: string;
  try {
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return deny(401, "Invalid access token");
    userId = user.id;
  } catch { return deny(401, "Invalid access token"); }
  let claims: unknown;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return deny(401, "Invalid token format");
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch { return deny(401, "Invalid token format"); }
  if (!validateMcpClaims(claims, {
    issuer: env.url.replace(/\/$/, "") + "/auth/v1",
    audience: process.env.LCS_MCP_TOKEN_AUDIENCE?.trim() || "authenticated",
    clientId, userId,
  })) return deny(401, "Token is not authorized for MCP");
  const { data: profile, error } = await db.from("profiles").select("id, role").eq("id", userId).single();
  if (error || !profile || (profile.role !== "admin" && profile.role !== "pm")) return deny(403, "MCP access denied");
  return { ok: true, db, userId, role: profile.role };
}
