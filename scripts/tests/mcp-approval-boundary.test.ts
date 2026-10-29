import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadSource } from "./helpers-load-source.ts";
const infra = { "@/lib/neon/server": {}, "@/lib/notification-chat": {} };
const messages = loadSource("src/lib/mcp-messages.ts", infra);
const business = loadSource("src/lib/mcp-clients.ts", { "@/lib/neon/server": {}, "@/lib/mcp-messages": messages });
const next = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
const actor = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
test("new MCP writes are opt-in and never enabled by labels or caller-provided roles", () => {
    for (const role of ["admin", "pm", "sale", "guest", "BOT"]) {
        assert.equal(messages.messagingEnabled(role, {}), false);
        assert.equal(business.clientWritesEnabled(role, {}), false);
    }
    assert.equal(messages.messagingEnabled("sale", { LCS_MCP_ENABLE_BOT_MESSAGING: "true" }), false);
    assert.equal(messages.messagingEnabled("admin", { LCS_MCP_ENABLE_BOT_MESSAGING: "TRUE" }), false);
    assert.equal(business.clientWritesEnabled("sale", { LCS_MCP_ENABLE_CLIENT_WRITES: "true" }), true);
});
test("เลขาคิม auto reply requires a granted room, an explicit mention, idempotency and rate limits", () => {
    const source = readFileSync(new URL("../../src/lib/secretary-kim-auto-reply.ts", import.meta.url), "utf8");
    assert.match(source, /JOIN public\.workspace_bot_channels/);
    assert.equal(source.includes("@(เลขาคิม|secretary-kim)"), true);
    assert.match(source, /ON CONFLICT DO NOTHING/);
    assert.equal(source.includes("minute_count ?? 0) >= 5"), true);
    assert.equal(source.includes("day_count ?? 0) >= 100"), true);
});
test("strict schemas reject self-approval and prevent partial updates from resetting omitted client fields", () => {
    assert.equal(messages.sendMessageSchema.safeParse({ channel_id: actor, message: "Hi", confirm: true }).success, false);
    assert.equal(messages.sendMessageSchema.safeParse({ channel_id: actor, message: "Hi", sender_id: actor }).success, false);
    const parsed = business.updateClientSchema.parse({ client_id: actor, changes: { name: "New" } });
    assert.deepEqual(parsed.changes, { name: "New" });
    for (const changes of [{}, { role: "admin" }, { created_by: actor }, { portal_enabled: true }, { budget: -1 }])
        assert.equal(business.updateClientSchema.safeParse({ client_id: actor, changes }).success, false);
});
test("a bearer token cannot replace the separate browser-session approval boundary", async () => {
    const route = loadSource("src/app/api/neon/mcp-approval/route.ts", { "next/server": next, "@/lib/neon/auth": { getNeonAuthContext: async () => ({ ok: false, status: 401, error: "Unauthorized" }) }, "@/lib/mcp-messages": messages, "@/lib/mcp-clients": business });
    const response = await route.PATCH(new Request("https://lcs.example/api/neon/mcp-approval", { method: "PATCH", headers: { origin: "https://lcs.example", authorization: "Bearer test-token" }, body: JSON.stringify({ request_id: requestId, decision: "approve" }) }));
    assert.equal(response.status, 401);
    const crossOrigin = await route.PATCH(new Request("https://lcs.example/api/neon/mcp-approval", { method: "PATCH", headers: { origin: "https://attacker.invalid" }, body: "{}" }));
    assert.equal(crossOrigin.status, 403);
});
test("approval API binds the actor to authenticated session and does not send messages itself", async () => {
    const calls: unknown[][] = [];
    const route = loadSource("src/app/api/neon/mcp-approval/route.ts", { "next/server": next, "@/lib/neon/auth": { getNeonAuthContext: async () => ({ ok: true, context: { userId: actor } }) }, "@/lib/mcp-clients": business, "@/lib/mcp-messages": { ...messages, reviewMcpMessage: async (...args: unknown[]) => { calls.push(args); return { status: "approved" }; } } });
    const response = await route.PATCH(new Request("https://lcs.example/api/neon/mcp-approval", { method: "PATCH", headers: { origin: "https://lcs.example" }, body: JSON.stringify({ request_id: requestId, decision: "approve", actor_user_id: requestId }) }));
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [[actor, requestId, "approve"]]);
});
test("MCP authentication rejects missing/invalid tokens and non-login bot identities", async () => {
    let databaseCalls = 0;
    function authentication(valid: boolean, isBot = false) { return loadSource("src/lib/mcp-auth.ts", { "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: valid ? { id: actor } : null }, error: valid ? null : new Error("invalid") }) } }) }, "@/lib/env": { getSupabaseEnv: () => ({ url: "https://auth.example.test", key: "test-public" }), getSiteUrl: () => "https://lcs.example" }, "@/lib/neon/server": { queryNeon: async () => { databaseCalls++; return { rows: [{ id: actor, role: "admin", account_type: isBot ? "BOT" : "HUMAN" }] }; } } }); }
    assert.equal(await authentication(true).authenticateMcpRequest(new Request("https://lcs.example/api/mcp")), null);
    assert.equal(databaseCalls, 0);
    assert.equal(await authentication(false).authenticateMcpRequest(new Request("https://lcs.example/api/mcp", { headers: { authorization: "Bearer invalid" } })), null);
    assert.equal(databaseCalls, 0);
    assert.equal(await authentication(true, true).authenticateMcpRequest(new Request("https://lcs.example/api/mcp", { headers: { authorization: "Bearer bot-session" } })), null);
});
