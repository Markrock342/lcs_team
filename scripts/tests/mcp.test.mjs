import test from "node:test";
import assert from "node:assert/strict";
import { MCP_VERSION, READ_TOOLS, TOOLS, processMcpMessage } from "../../src/lib/mcp/protocol.mjs";
import { validateMcpClaims } from "../../src/lib/mcp/claims.mjs";
import { canCreateTask } from "../../src/lib/mcp/write-gate.mjs";

const calls = [];
const operations = {
  list_clients: async (v) => { calls.push(["clients", v]); return [{ id: "synthetic", name: "Example" }]; },
  list_tasks: async (v) => { calls.push(["tasks", v]); return []; },
  get_workspace_summary: async () => { calls.push(["summary"]); return { clients: 1 }; },
  create_task: async (v) => { calls.push(["create_task", v]); return { task: { id: "synthetic-task", ...v, status: "pending" } }; },
};
const rpc = (id, method, params = {}) => ({ jsonrpc: "2.0", id, method, params });
const toolCall = (id, name, args = {}) => rpc(id, "tools/call", { name, arguments: args });
const validCreate = { title: " Example Task ", confirm: true, priority: "high", due_date: "2026-10-20" };

test("initialize advertises read-only by default, tool list hides write operations", async () => {
  const out = await processMcpMessage(rpc(1, "initialize", { protocolVersion: MCP_VERSION }), operations);
  assert.equal(out.body.result.protocolVersion, MCP_VERSION);
  const list = await processMcpMessage(rpc(2, "tools/list"), operations);
  assert.deepEqual(list.body.result.tools.map((t) => t.name), READ_TOOLS.map((t) => t.name));
  assert.equal(list.body.result.tools.some((t) => /create|update|delete/.test(t.name)), false);
  assert.equal(TOOLS.some((t) => t.name === "create_task"), true);
  assert.match(out.body.result.instructions, /disabled/);
});
test("read calls enforce bounds, whitelist and unknown tool rejection", async () => {
  calls.length = 0;
  const accepted = await processMcpMessage(toolCall(1, "list_clients", { limit: 2 }), operations);
  assert.equal(accepted.body.result.content[0].type, "text");
  assert.deepEqual(calls, [["clients", { limit: 2 }]]);
  for (const args of [{ limit: 51 }, { limit: -1 }, { limit: 2.2 }, { unknown: true }]) {
    const result = await processMcpMessage(toolCall(3, "list_clients", args), operations);
    assert.equal(result.body.error.code, -32602);
  }
  const disallowed = await processMcpMessage(toolCall(4, "delete_client"), operations);
  assert.equal(disallowed.body.error.code, -32602);
  assert.equal(calls.length, 1);
});
test("create_task is hidden and never invoked when write flag is off", async () => {
  calls.length = 0;
  const denied = await processMcpMessage(toolCall(1, "create_task", validCreate), operations);
  assert.equal(denied.body.error.code, -32602);
  assert.equal(calls.length, 0);
  const list = await processMcpMessage(rpc(2, "tools/list"), operations, { allowWrites: true });
  assert.equal(list.body.result.tools.some((t) => t.name === "create_task"), true);
});
test("create_task requires explicit confirm, rejects invalid and privilege-setting fields", async () => {
  calls.length = 0;
  for (const args of [
    { title: "A" }, { title: "A", confirm: false }, { title: "", confirm: true },
    { title: " ".repeat(5), confirm: true }, { title: "x".repeat(161), confirm: true },
    { title: "A", confirm: true, created_by: "forged" },
    { title: "A", confirm: true, status: "done" },
    { title: "A", confirm: true, progress: 100 },
    { title: "A", confirm: true, priority: "super" },
    { title: "A", confirm: true, due_date: "2026-02-30" },
    { title: "A", confirm: true, client_id: "not-a-uuid" },
    { title: "A", confirm: true, assigned_to: "not-a-uuid" },
    { title: "A", confirm: true, description: "x".repeat(2001) },
  ]) {
    const result = await processMcpMessage(toolCall(10, "create_task", args), operations, { allowWrites: true });
    assert.equal(result.body.error.code, -32602, JSON.stringify(args).slice(0, 90));
  }
  assert.equal(calls.length, 0);
});
test("one explicitly confirmed create_task sends only sanitized allowlisted fields", async () => {
  calls.length = 0;
  const out = await processMcpMessage(toolCall(12, "create_task", validCreate), operations, { allowWrites: true });
  assert.equal(out.body.result.isError, undefined);
  assert.deepEqual(calls, [["create_task", { title: "Example Task", priority: "high", due_date: "2026-10-20" }]]);
  assert.equal(JSON.parse(out.body.result.content[0].text).task.status, "pending");
});
test("create_task DB failures redact internal errors", async () => {
  const out = await processMcpMessage(toolCall(13, "create_task", validCreate), {
    ...operations, create_task: async () => { throw Error("database password secret"); },
  }, { allowWrites: true });
  assert.equal(out.body.result.isError, true);
  assert.equal(JSON.stringify(out).includes("secret"), false);
});
test("role and independent operator flags must both pass", () => {
  const enabled = { enabled: "true", roleGuardVerified: "true" };
  assert.equal(canCreateTask("admin", enabled), true);
  assert.equal(canCreateTask("pm", enabled), true);
  for (const role of ["backend", "design", "guest", "", null, "ADMIN"]) {
    assert.equal(canCreateTask(role, enabled), false);
  }
  for (const config of [
    { enabled: "true" }, { roleGuardVerified: "true" },
    { enabled: "false", roleGuardVerified: "true" },
    { enabled: "true", roleGuardVerified: "false" }, {},
  ]) assert.equal(canCreateTask("admin", config), false);
});
test("invalid JSON-RPC, notification and read-error redaction", async () => {
  const bad = await processMcpMessage({}, operations);
  assert.equal(bad.status, 400);
  const n = await processMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, operations);
  assert.equal(n.status, 202);
  const broken = await processMcpMessage(toolCall(8, "list_tasks"), {
    ...operations, list_tasks: async () => { throw Error("database secret error"); },
  });
  assert.equal(broken.body.result.isError, true);
  assert.equal(JSON.stringify(broken).includes("secret"), false);
});
test("claims require validated OAuth client, issuer, user, role, expiry and audience", () => {
  const expect = { issuer: "https://example.supabase.co/auth/v1", audience: "authenticated", clientId: "approved", userId: "user-1" };
  const claims = { iss: expect.issuer, aud: "authenticated", client_id: "approved", sub: "user-1", role: "authenticated", exp: 2000 };
  assert.equal(validateMcpClaims(claims, expect, 1000), true);
  for (const change of [
    { client_id: undefined }, { iss: "https://other" }, { sub: "other" },
    { role: "service_role" }, { aud: "different" }, { exp: 900 }, { nbf: 2001 },
  ]) assert.equal(validateMcpClaims({ ...claims, ...change }, expect, 1000), false);
  assert.equal(validateMcpClaims(null, expect, 1000), false);
});
