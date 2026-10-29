import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateTeamTags } from "../../src/lib/team-tags.ts";
import { pushErrorMessage, pushKeysMatch, withPushTimeout } from "../../src/lib/push-client.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
// Load the actual handlers/browser flow with isolated network and auth dependencies.
function loadModule(path: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const filename = fileURLToPath(new URL(`../../${path}`, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const record = { exports: {} as Record<string, (...args: any[]) => any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  new Function("require", "module", "exports", ...Object.keys(globals), compiled)((id: string) => {
    if (!(id in mocks)) throw new Error(`Unexpected dependency: ${id}`);
    return mocks[id];
  }, record, record.exports, ...Object.values(globals));
  return record.exports;
}
const selfId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const next = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };

function profileRoute(admin: boolean) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const route = loadModule("src/app/api/neon/profiles/route.ts", {
    "next/server": next,
    "@/lib/neon/auth": { getNeonAuthContext: async () => ({ ok: true, context: { userId: selfId, profile: { role: admin ? "admin" : "guest" } } }) },
    "@/lib/neon/server": { queryNeon: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: [{ id: otherId, custom_tags: params[0] }] }; } },
    "@/lib/team-tags": { validateTeamTags },
    "@/lib/types": { TEAM_ROLES: ["admin", "pm", "accounting", "backend", "frontend", "design", "sale", "guest"] },
  });
  return { route, calls };
}
function patchTags(tags: unknown, id = otherId) {
  return new Request("http://localhost/api/neon/profiles", { method: "PATCH", body: JSON.stringify({ id, data: { custom_tags: tags } }) });
}

test("only admins can assign custom team tags, including their own", async () => {
  const { route, calls } = profileRoute(false);
  assert.equal((await route.PATCH(patchTags(["Admin"], selfId))).status, 403);
  assert.equal((await route.PATCH(patchTags(["QA"]))).status, 403);
  assert.equal(calls.length, 0);
});

test("custom tags normalize and clear without writing privilege fields", async () => {
  const { route, calls } = profileRoute(true);
  assert.equal((await route.PATCH(patchTags([" QA ", "qa", "ทีม  วิดีโอ"]))).status, 200);
  assert.deepEqual(calls[0].params, [["QA", "ทีม วิดีโอ"], otherId]);
  assert.match(calls[0].sql, /SET custom_tags = \$1/);
  assert.doesNotMatch(calls[0].sql, /SET role|display_roles/);
  assert.equal((await route.PATCH(patchTags([]))).status, 200);
  assert.deepEqual(calls[1].params[0], []);
});

test("invalid or unbounded tags are rejected before database writes", async () => {
  const { route, calls } = profileRoute(true);
  for (const tags of [["x".repeat(33)], ["line\nbreak"], ["  "], [null], "QA", Array(11).fill("QA")]) {
    assert.equal((await route.PATCH(patchTags(tags))).status, 400);
  }
  assert.equal(calls.length, 0);
});

function browserPush({ stale = false, failure = false, supported = true } = {}) {
  const events: string[] = [];
  const key = new Uint8Array(65); key.fill(1); key[0] = 4;
  const sub = { options: { applicationServerKey: key.buffer }, unsubscribe: async () => { events.push("unsubscribe"); return true; }, toJSON: () => ({ endpoint: "https://push.test/endpoint", keys: { p256dh: "test", auth: "test" } }) };
  const old = { ...sub, options: { applicationServerKey: new Uint8Array(65).buffer } };
  const reg = { pushManager: {
    getSubscription: async () => stale ? old : null,
    subscribe: async () => { events.push("subscribe"); if (failure) throw new DOMException("Registration failed - push service error", "AbortError"); return sub; },
  } };
  const notification = { permission: "default", requestPermission: async () => { events.push("permission"); return "granted"; } };
  const browserWindow = { PushManager: {}, ...(supported ? { Notification: notification } : {}), isSecureContext: true, atob };
  const loaded = loadModule("src/components/PWARegister.tsx", {
    react: {}, "next/navigation": {}, "@/lib/push-client": { pushErrorMessage, pushKeysMatch, withPushTimeout },
  }, {
    window: browserWindow, Notification: notification,
    navigator: { onLine: true, serviceWorker: { register: async () => { events.push("register"); return reg; }, ready: Promise.resolve(reg) } },
    process: { env: { NODE_ENV: "production", NEXT_PUBLIC_VAPID_PUBLIC_KEY: Buffer.from(key).toString("base64url") } },
    fetch: async () => { events.push("persist"); return Response.json({ ok: true }); },
  });
  return { loaded, events };
}

test("push permission stays within the button gesture and rotated keys resubscribe before saving", async () => {
  const { loaded, events } = browserPush({ stale: true });
  assert.deepEqual(await loaded.subscribeToPush(), { ok: true });
  assert.deepEqual(events, ["permission", "register", "unsubscribe", "subscribe", "persist"]);
});

test("browser push service failures return actionable Thai without claiming registration succeeded", async () => {
  const { loaded, events } = browserPush({ failure: true });
  const result = await loaded.subscribeToPush();
  assert.equal(result.ok, false);
  assert.match(result.error, /เชื่อมต่อบริการ Push ไม่สำเร็จ/);
  assert.equal(events.includes("persist"), false);
  const unsupported = browserPush({ supported: false });
  assert.equal((await unsupported.loaded.subscribeToPush()).ok, false);
  assert.deepEqual(unsupported.events, []);
});

test("unresponsive push APIs time out instead of leaving the settings button spinning", async () => {
  await assert.rejects(withPushTimeout(new Promise(() => {}), 5), { name: "TimeoutError" });
});

test("push test endpoint reports a failure when no provider accepts the delivery", async () => {
  for (const result of [{ sent: 0, configured: false }, { sent: 0, configured: true }, { sent: 1, configured: true }]) {
    const route = loadModule("src/app/api/push/test/route.ts", {
      "next/server": next,
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: selfId } } }) } }) },
      "@/lib/neon/server": { queryNeon: async () => ({ rows: [{ endpoint: "https://push.test/endpoint" }] }) },
      "@/lib/push-server": { sendPushToUser: async () => result },
    });
    assert.equal((await route.POST()).status, result.sent ? 200 : 502);
  }
});

test("GIF config requires login and exposes only the dedicated browser key without caching", async () => {
  for (const signedIn of [false, true]) {
    const route = loadModule("src/app/api/neon/gifs/route.ts", {
      "next/server": next,
      "@/lib/neon/auth": { getNeonAuthContext: async () => signedIn ? { ok: true, context: {} } : { ok: false, status: 401, error: "Unauthorized" } },
    }, { process: { env: { GIPHY_API_KEY: " test-web-key ", VAPID_PRIVATE_KEY: "unrelated-secret" } } });
    const response = await route.GET();
    assert.equal(response.status, signedIn ? 200 : 401);
    const body = await response.json();
    if (signedIn) {
      assert.deepEqual(body, { enabled: true, apiKey: "test-web-key" });
      assert.match(response.headers.get("cache-control")!, /no-store/);
    } else assert.equal(body.apiKey, undefined);
  }
});

test("online GIF search preserves Thai query and provider URLs and uses the direct provider endpoint", async () => {
  let requested: URL | null = null;
  const media = "https://media.giphy.com/media/test/giphy.gif?cid=test&rid=giphy.gif";
  const loaded = loadModule("src/lib/chat-giphy.ts", {}, { fetch: async (url: URL) => {
    requested = url;
    return Response.json({ data: [{ id: "test", title: "Thanks", images: { original: { url: media } } }], pagination: { offset: 0, count: 1, total_count: 1 } });
  } });
  const result = await loaded.searchGiphy("test-key", "ขอบคุณ", 0, new AbortController().signal);
  assert.equal(requested!.origin, "https://api.giphy.com");
  assert.equal(requested!.searchParams.get("q"), "ขอบคุณ");
  assert.equal(requested!.searchParams.get("rating"), "pg");
  assert.equal(result.gifs[0].url, media);
  assert.equal(result.gifs[0].provider, "giphy");
  assert.equal(result.nextOffset, null);
});
