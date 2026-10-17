// Dependency-free, stateless MCP Streamable HTTP JSON-RPC core (2025-06-18).
// Pure functions: does not connect to Supabase or access secrets.
export const MCP_VERSION = "2025-06-18";

const schema = (properties) => ({
  type: "object", properties, additionalProperties: false,
});
const LIMIT = { type: "integer", minimum: 1, maximum: 50, default: 20 };
export const TOOLS = Object.freeze([
  { name: "list_clients", description: "Read up to 50 LCS client metadata rows; excludes contact information and notes.", inputSchema: schema({ limit: LIMIT }) },
  { name: "list_tasks", description: "Read up to 50 LCS task metadata rows; excludes descriptions, files, and contact information.", inputSchema: schema({
    limit: LIMIT, status: { type: "string", enum: ["pending", "waiting", "in_progress", "review", "done"] },
  }) },
  { name: "get_workspace_summary", description: "Read aggregate client and task counts only.", inputSchema: schema({}) },
]);

const allowedStatuses = new Set(["pending", "waiting", "in_progress", "review", "done"]);
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (value, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}),
});
function argumentsFor(name, args) {
  if (!record(args)) return null;
  const keys = Object.keys(args);
  if (name === "get_workspace_summary") return keys.length ? null : {};
  const validKeys = name === "list_clients" ? ["limit"] : ["limit", "status"];
  if (keys.some((k) => !validKeys.includes(k))) return null;
  const limit = args.limit === undefined ? 20 : args.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  if (name === "list_tasks" && args.status !== undefined && !allowedStatuses.has(args.status)) return null;
  return name === "list_tasks" ? { limit, ...(args.status ? { status: args.status } : {}) } : { limit };
}

/** @param {unknown} message @param {{list_clients: Function,list_tasks: Function,get_workspace_summary: Function}} operations */
export async function processMcpMessage(message, operations) {
  if (!record(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { status: 400, body: err(null, -32600, "Invalid Request") };
  }
  // Incoming responses and notifications have no response payload.
  if (!own(message, "id")) {
    if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
      return { status: 202, body: null };
    }
    return { status: 400, body: err(null, -32600, "Unsupported notification") };
  }
  const id = message.id;
  if (!(typeof id === "string" || (typeof id === "number" && Number.isFinite(id)))) {
    return { status: 400, body: err(null, -32600, "Invalid request ID") };
  }

  switch (message.method) {
    case "initialize":
      if (!record(message.params) || typeof message.params.protocolVersion !== "string") {
        return { status: 200, body: err(id, -32602, "Invalid initialize parameters") };
      }
      return { status: 200, body: ok(id, {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "lcs-team-readonly", version: "0.1.0" },
        instructions: "Read-only LCS workspace. Never infer or attempt write operations.",
      }) };
    case "ping":
      return { status: 200, body: ok(id, {}) };
    case "tools/list":
      return { status: 200, body: ok(id, { tools: TOOLS }) };
    case "tools/call": {
      const params = message.params;
      if (!record(params) || typeof params.name !== "string") {
        return { status: 200, body: err(id, -32602, "Invalid tool parameters") };
      }
      if (!own(operations, params.name) || !TOOLS.some((tool) => tool.name === params.name)) {
        return { status: 200, body: err(id, -32602, "Unknown tool") };
      }
      const args = argumentsFor(params.name, params.arguments ?? {});
      if (!args) return { status: 200, body: err(id, -32602, "Invalid tool arguments") };
      try {
        const value = await operations[params.name](args);
        return { status: 200, body: ok(id, toolResult(value)) };
      } catch {
        return { status: 200, body: ok(id, toolResult({ error: "Read operation failed" }, true)) };
      }
    }
    default: return { status: 200, body: err(id, -32601, "Method not found") };
  }
}
