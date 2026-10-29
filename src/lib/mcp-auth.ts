import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, getSiteUrl } from "@/lib/env";
import { queryNeon } from "@/lib/neon/server";
import type { Profile } from "@/lib/types";

export type McpIdentity = { userId: string; profile: Profile };

export function mcpResourceUrl() {
  return `${getSiteUrl()}/api/mcp`;
}

export function mcpAuthChallenge(error = "invalid_token", description = "Sign in to LCS to continue") {
  const metadataUrl = `${getSiteUrl()}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadataUrl}", error="${error}", error_description="${description}"`;
}

export function unauthorizedMcpResponse(description = "กรุณาเชื่อมบัญชี LCS ก่อนใช้งาน") {
  return Response.json(
    { error: "unauthorized", error_description: description },
    {
      status: 401,
      headers: {
        // HTTP header values must remain ByteString/ASCII; localized detail stays in the JSON body.
        "WWW-Authenticate": mcpAuthChallenge("invalid_token", "Sign in to LCS to continue"),
      },
    },
  );
}

export async function authenticateMcpRequest(request: Request): Promise<McpIdentity | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  const env = getSupabaseEnv();
  if (!token || !env) return null;

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { rows } = await queryNeon<Profile>(
    `SELECT * FROM public.profiles WHERE id = $1 LIMIT 1`,
    [data.user.id],
  );
  const profile = rows[0];
  if (!profile || profile.role === "guest" || profile.account_type === "BOT") return null;
  return { userId: data.user.id, profile };
}
