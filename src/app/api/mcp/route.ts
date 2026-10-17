import { authenticateMcp } from "@/lib/mcp/auth";
import { readOperations } from "@/lib/mcp/operations";
import { MCP_VERSION, processMcpMessage } from "@/lib/mcp/protocol.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
async function handle(request: Request): Promise<Response> {
  // No browser-origin access is needed: remote MCP clients send Bearer tokens.
  if (request.headers.has("origin")) return new Response(null, { status: 403, headers: noStore });
  const auth = await authenticateMcp(request);
  if (!auth.ok) return auth.response;
  if (request.method === "GET") return new Response(null, { status: 405, headers: { ...noStore, Allow: "POST, DELETE" } });
  if (request.method === "DELETE") return new Response(null, { status: 405, headers: { ...noStore, Allow: "POST" } });
  const version = request.headers.get("mcp-protocol-version");
  if (version && version !== MCP_VERSION) return Response.json({ error: "Unsupported MCP version" }, { status: 400, headers: noStore });
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return Response.json({ error: "Expected application/json" }, { status: 415, headers: noStore });
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return Response.json({ error: "MCP Accept header required" }, { status: 406, headers: noStore });
  }
  let message: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 65536) return new Response(null, { status: 413, headers: noStore });
    message = JSON.parse(body);
  } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: noStore }); }
  if (Array.isArray(message)) return Response.json({ error: "Batch requests not supported" }, { status: 400, headers: noStore });
  const result = await processMcpMessage(message, readOperations(auth.db));
  if (result.body === null) return new Response(null, { status: result.status, headers: noStore });
  return Response.json(result.body, { status: result.status, headers: noStore });
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
