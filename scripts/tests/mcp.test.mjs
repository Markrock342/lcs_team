import test from "node:test";
import assert from "node:assert/strict";
import { MCP_VERSION, TOOLS, processMcpMessage } from "../../src/lib/mcp/protocol.mjs";
import { validateMcpClaims } from "../../src/lib/mcp/claims.mjs";

const calls = [];
const operations = {
  list_clients: async (v) => { calls.push(["clients", v]); return [{ id: "synthetic", name: "Example" }]; },
  list_tasks: async (v) => { calls.push(["tasks", v]); return []; },
  get_workspace_summary: async () => { calls.push(["summary"]); return { clients: 1 }; },
};
const rpc = (id, method, params = {}) => ({ jsonrpc: "2.0", id, method, params });
test("initialize advertises read-only tools", async () => {
  const out = await processMcpMessage(rpc(1, "initialize", { protocolVersion: MCP_VERSION }), operations);
  assert.equal(out.body.result.protocolVersion, MCP_VERSION);
  const list = await processMcpMessage(rpc(2, "tools/list"), operations);
  assert.deepEqual(list.body.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.equal(list.body.result.tools.some((t) => /create|update|delete/.test(t.name)), false);
});
test("calls enforce bounds, whitelist and no unknown tools", async () => {
  calls.length = 0;
  const accepted = await processMcpMessage(rpc(1, "tools/call", { name: "list_clients", arguments: { limit: 2 } }), operations);
  assert.equal(accepted.body.result.content[0].type, "text");
  assert.deepEqual(calls, [["clients", { limit: 2 }]]);
  for (const args of [{ limit: 51 }, { limit: -1 }, { limit: 2.2 }, { unknown: true }]) {
    const result = await processMcpMessage(rpc(3, "tools/call", { name: "list_clients", arguments: args }), operations);
    assert.equal(result.body.error.code, -32602);
  }
  const disallowed = await processMcpMessage(rpc(4, "tools/call", { name: "delete_client", arguments: {} }), operations);
  assert.equal(disallowed.body.error.code, -32602);
  assert.equal(calls.length, 1);
});
test("invalid JSON-RPC, notification, error redaction", async () => {
  const bad = await processMcpMessage({}, operations);
  assert.equal(bad.status, 400);
  const n = await processMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, operations);
  assert.equal(n.status, 202);
  const broken = await processMcpMessage(rpc(8, "tools/call", { name: "list_tasks" }), {
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
