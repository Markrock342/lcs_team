// Dependency-free, stateless MCP Streamable HTTP JSON-RPC core (2025-06-18).
// Pure functions: no database, secrets, or live workspace access.
export const MCP_VERSION = "2025-06-18";

const schema = (properties, required = []) => ({
  type: "object", properties, required, additionalProperties: false,
});
const LIMIT = { type: "integer", minimum: 1, maximum: 50, default: 20 };
export const READ_TOOLS = Object.freeze([
  { name: "list_clients", description: "Read up to 50 LCS client metadata rows; excludes contact information and notes.", inputSchema: schema({ limit: LIMIT }) },
  { name: "list_tasks", description: "Read up to 50 LCS task metadata rows; excludes descriptions, files, and contact information.", inputSchema: schema({
    limit: LIMIT, status: { type: "string", enum: ["pending", "waiting", "in_progress", "review", "done"] },
  }) },
  { name: "get_workspace_summary", description: "Read aggregate client and task counts only.", inputSchema: schema({}) },
]);
export const WRITE_TOOLS = Object.freeze([
  { name: "create_task", description: "WRITE ACTION: Create exactly one task in LCS Team. Requires the user's explicit approval for this particular task. Available only to verified admin/PM after the separately reviewed write gates are enabled. Do not use for testing on production data.", inputSchema: schema({
    title: { type: "string", minLength: 1, maxLength: 160, description: "Task title (trimmed)." },
    description: { type: "string", maxLength: 2000 },
    client_id: { type: "string", format: "uuid", description: "Optional existing client/project. Omit for an unlinked task." },
    assigned_to: { type: "string", format: "uuid", description: "Optional existing team member; omit to leave unassigned." },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"], default: "medium" },
    due_date: { type: "string", format: "date", description: "Optional YYYY-MM-DD." },
    confirm: { type: "boolean", const: true, description: "Set true only after the user explicitly approves creation of this exact task." },
  }, ["title", "confirm"]) },
]);
export const TOOLS = Object.freeze([...READ_TOOLS, ...WRITE_TOOLS]);

const allowedStatuses = new Set(["pending", "waiting", "in_progress", "review", "done"]);
const allowedPriorities = new Set(["low", "medium", "high", "urgent"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (value, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}),
});
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function argumentsFor(name, args) {
  if (!record(args)) return null;
  const keys = Object.keys(args);
  if (name === "get_workspace_summary") return keys.length ? null : {};
  if (name === "create_task") {
    const validKeys = ["title", "description", "client_id", "assigned_to", "priority", "due_date", "confirm"];
    if (keys.some((key) => !validKeys.includes(key)) || args.confirm !== true) return null;
    if (typeof args.title !== "string") return null;
    const title = args.title.trim();
    if (title.length < 1 || title.length > 160) return null;
    if (args.description !== undefined && (typeof args.description !== "string" || args.description.length > 2000)) return null;
    if (args.client_id !== undefined && (typeof args.client_id !== "string" || !uuid.test(args.client_id))) return null;
    if (args.assigned_to !== undefined && (typeof args.assigned_to !== "string" || !uuid.test(args.assigned_to))) return null;
    const priority = args.priority === undefined ? "medium" : args.priority;
    if (!allowedPriorities.has(priority)) return null;
    if (args.due_date !== undefined && !validDate(args.due_date)) return null;
    return {
      title, priority,
      ...(args.description !== undefined ? { description: args.description.trim() } : {}),
      ...(args.client_id !== undefined ? { client_id: args.client_id } : {}),
      ...(args.assigned_to !== undefined ? { assigned_to: args.assigned_to } : {}),
      ...(args.due_date !== undefined ? { due_date: args.due_date } : {}),
    };
  }
  const validKeys = name === "list_clients" ? ["limit"] : ["limit", "status"];
  if (keys.some((key) => !validKeys.includes(key))) return null;
  const limit = args.limit === undefined ? 20 : args.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  if (name === "list_tasks" && args.status !== undefined && !allowedStatuses.has(args.status)) return null;
  return name === "list_tasks" ? { limit, ...(args.status ? { status: args.status } : {}) } : { limit };
}

/** @param {unknown} message
 * @param {{list_clients: Function,list_tasks: Function,get_workspace_summary: Function,create_task?: Function}} operations
 * @param {{allowWrites?: boolean}} options
 */
export async function processMcpMessage(message, operations, options = {}) {
  const allowWrites = options.allowWrites === true;
  const advertisedTools = allowWrites ? TOOLS : READ_TOOLS;
  if (!record(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { status: 400, body: err(null, -32600, "Invalid Request") };
  }
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
        serverInfo: { name: "lcs-team-mcp", version: "0.2.0" },
        instructions: allowWrites
          ? "LCS Team: read tools and explicitly approved create_task only. Obtain user confirmation for each task."
          : "Read-only LCS workspace. Write operations are disabled.",
      }) };
    case "ping": return { status: 200, body: ok(id, {}) };
    case "tools/list": return { status: 200, body: ok(id, { tools: advertisedTools }) };
    case "tools/call": {
      const params = message.params;
      if (!record(params) || typeof params.name !== "string") {
        return { status: 200, body: err(id, -32602, "Invalid tool parameters") };
      }
      if (!own(operations, params.name) || !advertisedTools.some((tool) => tool.name === params.name)) {
        return { status: 200, body: err(id, -32602, "Unknown tool") };
      }
      const args = argumentsFor(params.name, params.arguments ?? {});
      if (!args) return { status: 200, body: err(id, -32602, "Invalid tool arguments") };
      try {
        const value = await operations[params.name](args);
        return { status: 200, body: ok(id, toolResult(value)) };
      } catch {
        const message = params.name === "create_task" ? "Task creation failed" : "Read operation failed";
        return { status: 200, body: ok(id, toolResult({ error: message }, true)) };
      }
    }
    default: return { status: 200, body: err(id, -32601, "Method not found") };
  }
}
