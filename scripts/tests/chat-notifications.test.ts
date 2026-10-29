import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

// Exercise the real route handlers without a production database or external push.
function loadModule(path: string, mocks: Record<string, unknown>) {
  const filename = fileURLToPath(new URL(`../../${path}`, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleRecord = { exports: {} as Record<string, (...args: any[]) => any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  new Function("require", "module", "exports", compiled)((id: string) => {
    if (!(id in mocks)) throw new Error(`Unexpected dependency: ${id}`);
    return mocks[id];
  }, moduleRecord, moduleRecord.exports);
  return moduleRecord.exports;
}

const userId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const auth = { getNeonAuthContext: async () => ({ ok: true, context: { userId, profile: { display_name: "Test", role: "member" } } }) };
const next = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };

function chatRoute(failInbox = false, allow = true) {
  const state = { message: false, inbox: false, committed: false, pushed: false };
  const jobs: Array<() => Promise<void>> = [];
  const chatNotifications = loadModule("src/lib/notification-chat.ts", {
    "@/lib/channels": {}, "@/lib/notification-server": {}, "@/lib/neon/server": {},
  });
  const route = loadModule("src/app/api/neon/chat/route.ts", {
    "next/server": { ...next, after: (job: () => Promise<void>) => jobs.push(job) },
    "@/lib/neon/auth": auth,
    "@/lib/neon/server": {
      queryNeon: async () => ({ rows: allow ? [{ ok: true }] : [] }),
      withNeonTransaction: async (operation: (client: unknown) => Promise<unknown>) => {
        try {
          const result = await operation({ query: async (sql: string) => {
            if (sql.includes("INSERT INTO public.messages")) { state.message = true; return { rows: [{ id: messageId }] }; }
            if (sql.includes("INSERT INTO public.notifications")) {
              assert.equal(state.message, true);
              if (failInbox) throw new Error("inbox write failed");
              state.inbox = true;
              return { rows: [] };
            }
            return { rows: [{ id: messageId, channel_id: channelId, sender_id: userId, content: "one\ntwo" }] };
          } });
          state.committed = true;
          return result;
        } catch (error) { state.message = false; state.inbox = false; throw error; }
      },
    },
    "@/lib/notification-chat": {
      insertChatMessageNotifications: chatNotifications.insertChatMessageNotifications,
      processChatMessageNotifications: async () => { assert.equal(state.committed, true); state.pushed = true; },
    },
    "@/lib/secretary-kim-auto-reply": { respondAsSecretaryKim: async () => {} },
  });
  return { route, state, jobs };
}

function sendRequest() {
  return new Request("http://localhost/api/neon/chat", { method: "POST", body: JSON.stringify({ action: "message", data: { channel_id: channelId, content: "one\ntwo" } }) });
}

test("message success includes a durable inbox before responding; push can finish after the sender leaves", async () => {
  const { route, state, jobs } = chatRoute();
  const response = await route.POST(sendRequest());
  assert.equal(response.status, 201);
  assert.deepEqual(state, { message: true, inbox: true, committed: true, pushed: false });
  assert.equal((await response.json()).message.content, "one\ntwo");
  assert.equal(jobs.length, 2);
  await Promise.all(jobs.map((job) => job()));
  assert.equal(state.pushed, true);
});

test("inbox failure rolls back the message and does not schedule delivery", async () => {
  const { route, state, jobs } = chatRoute(true);
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal((await route.POST(sendRequest())).status, 500);
    assert.deepEqual(state, { message: false, inbox: false, committed: false, pushed: false });
    assert.equal(jobs.length, 0);
  } finally { console.error = original; }
});

test("a user without channel access cannot create a message or its notifications", async () => {
  const { route, state, jobs } = chatRoute(false, false);
  assert.equal((await route.POST(sendRequest())).status, 403);
  assert.equal(state.message, false);
  assert.equal(jobs.length, 0);
});

test("channel read acknowledges message deep links and stays scoped to the authenticated user", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const route = loadModule("src/app/api/neon/notifications/route.ts", {
    "next/server": next, "@/lib/neon/auth": auth,
    "@/lib/neon/server": { queryNeon: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: [] }; } },
  });
  const request = (id: string) => new Request("http://localhost/api/neon/notifications", { method: "PATCH", body: JSON.stringify({ channelId: id, read: true }) });
  assert.equal((await route.PATCH(request(channelId))).status, 200);
  assert.deepEqual(calls[0].params, [true, userId, channelId, `/chat?channel=${channelId}`, `/chat?channel=${channelId}&%`]);
  assert.match(calls[0].sql, /n\.user_id=\$2/);
  assert.equal((await route.PATCH(request("%"))).status, 400);
  assert.equal(calls.length, 1);
});

test("in-app notices respect category preferences without requiring browser push permission", async () => {
  const inserted: unknown[][] = [];
  const deliver = loadModule("src/lib/notification-server.ts", {
    "@/lib/neon/server": { queryNeon: async (sql: string, values: unknown[]) => {
      if (sql.includes("FROM public.profiles")) return { rows: [
        { id: "enabled", push_enabled: false, notify_chat: true },
        { id: "muted", push_enabled: true, notify_chat: false },
        { id: "mentioned", push_enabled: false, notify_chat: false, notify_mentions: true },
      ] };
      if (sql.includes("INSERT INTO public.notifications")) { inserted.push(values); return { rows: [{ id: String(inserted.length), push_sent: false }] }; }
      return { rows: [] };
    } },
    "@/lib/push-server": { sendPushToUser: () => assert.fail("No push permission should be required") },
  });
  const result = await deliver.deliverNotifications([
    { userId: "enabled", title: "New", body: "Text", kind: "chat" },
    { userId: "muted", title: "New", body: "Text", kind: "chat" },
    { userId: "mentioned", title: "Mention", body: "Text", kind: "mention" },
  ]);
  assert.deepEqual(inserted.map((values) => values[0]), ["enabled", "mentioned"]);
  assert.deepEqual(result, { inserted: 2, pushed: 0 });
});
