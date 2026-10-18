import { getSupabaseEnv } from "@/lib/env";
import { mcpResourceUrl } from "@/lib/mcp-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getSupabaseEnv();
  if (!env) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  return Response.json({
    resource: mcpResourceUrl(),
    authorization_servers: [`${env.url}/auth/v1`],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${mcpResourceUrl().replace(/\/api\/mcp$/, "")}/settings`,
  }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
