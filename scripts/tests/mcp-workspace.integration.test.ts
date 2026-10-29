import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg, { type PoolClient } from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runVerifiedMigration } from "../verified-migration.mjs";
import { loadSource } from "./helpers-load-source.ts";
const testUrl = process.env.LCS_TEST_DATABASE_URL;
test("isolated PostgreSQL: bot, MCP writes, approvals, mute and existing tools", { skip: !testUrl }, async (t) => {
    const url = new URL(testUrl!);
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Integration tests refuse non-local databases");
    const admin = new pg.Pool({ connectionString: url.toString() });
    const dbName = `lcs_kim_test_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${dbName}"`);
    url.pathname = `/${dbName}`;
    const pool = new pg.Pool({ connectionString: url.toString(), max: 8 });
    try {
        for (const path of ["scripts/tests/fixtures/workspace.sql", "scripts/neon-team-engineering-workspace.sql", "scripts/neon-chat-mutes.sql"]) {
            await pool.query(readFileSync(path, "utf8"));
        }
        const unwrap = (sql: string) => sql.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
        const releaseSql = `BEGIN;\n${unwrap(readFileSync("scripts/neon-secretary-kim.sql", "utf8"))}\n${unwrap(readFileSync("scripts/neon-mcp-client-writes.sql", "utf8"))}\nCOMMIT;`;
        const migrationClient = await pool.connect();
        async function counts(client: PoolClient) { const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`); const values: Record<string, string> = {}; for (const row of tables.rows) {
            const count = await client.query(`SELECT count(*)::text AS count FROM public."${String(row.tablename).replaceAll('"', '""')}"`);
            values[row.tablename] = count.rows[0].count;
        } return values; }
        try {
            await runVerifiedMigration(migrationClient, releaseSql, counts, ["workspace_bots", "mcp_business_requests"], { profiles: 1 });
            await runVerifiedMigration(migrationClient, releaseSql, counts, ["workspace_bots", "mcp_business_requests"]);
        }
        finally {
            migrationClient.release();
        }
        const actor = randomUUID(), partner = randomUUID(), guest = randomUUID(), outsider = randomUUID(), rateActor = randomUUID();
        for (const [id, name, role] of [[actor, "Mark", "admin"], [partner, "Partner", "backend"], [guest, "Guest", "guest"], [outsider, "Other", "admin"], [rateActor, "Rate actor", "admin"]])
            await pool.query(`INSERT INTO profiles(id,username,display_name,role,notify_chat,notify_mentions) VALUES($1,$2,$2,$3,false,false)`, [id, name, role]);
        await pool.query(`UPDATE profiles SET notify_chat=true,notify_mentions=true,push_enabled=true WHERE id=$1`, [partner]);
        const room = randomUUID(), noBot = randomUUID(), dm = randomUUID(), privateDm = randomUUID();
        for (const [id, name, kind, owner] of [[room, "CHJ", "channel", actor], [noBot, "No bot", "channel", actor], [dm, "dm:existing", "dm", actor], [privateDm, "dm:private", "dm", outsider]])
            await pool.query(`INSERT INTO channels(id,name,kind,created_by) VALUES($1,$2,$3,$4)`, [id, name, kind, owner]);
        const bot = (await pool.query(`SELECT profile_id FROM workspace_bots WHERE slug='secretary-kim'`)).rows[0].profile_id;
        await pool.query(`UPDATE workspace_bots SET enabled=true`);
        for (const channel of [room, dm]) {
            await pool.query(`INSERT INTO workspace_bot_channels(bot_user_id,channel_id,granted_by) VALUES($1,$2,$3)`, [bot, channel, actor]);
            await pool.query(`INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2)`, [channel, bot]);
        }
        await pool.query(`INSERT INTO channel_members VALUES($1,$2),($1,$3)`, [dm, actor, partner]);
        const env = { LCS_MCP_ENABLE_BOT_MESSAGING: "true", LCS_MCP_ENABLE_CLIENT_WRITES: "true", LCS_MCP_ENABLE_TASK_CREATION: "true", LCS_MCP_ROLE_GUARD_VERIFIED: "true" };
        const database = { queryNeon: (sql: string, values: unknown[] = []) => pool.query(sql, values), withNeonTransaction: async (operation: (client: PoolClient) => Promise<unknown>) => { const client = await pool.connect(); try {
                await client.query("BEGIN");
                const result = await operation(client);
                await client.query("COMMIT");
                return result;
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
            finally {
                client.release();
            } } };
        const inserts = loadSource("src/lib/notification-chat.ts", { "@/lib/channels": {}, "@/lib/notification-server": {}, "@/lib/neon/server": database });
        const messages = loadSource("src/lib/mcp-messages.ts", { "@/lib/neon/server": database, "@/lib/notification-chat": inserts }, { process: { env } });
        const business = loadSource("src/lib/mcp-clients.ts", { "@/lib/neon/server": database, "@/lib/mcp-messages": messages }, { process: { env } });
        const next = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
        const auth = (id: string) => ({ getNeonAuthContext: async () => ({ ok: true, context: { userId: id, profile: { id, role: "admin", display_name: "Mark" } } }) });
        const countMessages = async () => Number((await pool.query(`SELECT count(*) FROM messages`)).rows[0].count);
        async function proposal(text: string, user = actor, channel = room) { return messages.sendMcpMessage(user, { channel_id: channel, message: text, idempotency_key: randomUUID() }); }
        async function approved(text: string, user = actor, channel = room) { const pending = await proposal(text, user, channel); await messages.reviewMcpMessage(user, pending.request_id, "approve"); return pending; }
        const input = (pending: {
            channel_id: string;
            message: string;
            idempotency_key: string;
        }) => ({ channel_id: pending.channel_id, message: pending.message, idempotency_key: pending.idempotency_key });
        await t.test("migration creates a separate non-login bot, is repeatable, and grants no rooms by default", async () => {
            const profile = (await pool.query(`SELECT * FROM profiles WHERE id=$1`, [bot])).rows[0];
            assert.notEqual(bot, actor);
            assert.equal(profile.account_type, "BOT");
            assert.equal(profile.display_name, "เลขาคิม");
            assert.equal(profile.role, "guest");
            assert.equal(profile.push_enabled, false);
            assert.equal((await pool.query(`SELECT count(*)::int AS count FROM profiles WHERE username='secretary-kim'`)).rows[0].count, 1);
            const blocked = await messages.listMcpChannels(actor, true);
            assert.equal(blocked.find((row: {
                channel_id: string;
            }) => row.channel_id === noBot).can_send_message, false);
        });
        await t.test("MCP cannot self-approve, spoof the sender, or bypass actor/bot/private-DM permissions", async () => {
            for (const body of [{ channel_id: room, message: "x", sender_id: actor }, { channel_id: room, message: "x", confirm: true }, { channel_id: "bad", message: "x" }, { channel_id: room, message: " " }, { channel_id: room, message: "x".repeat(4001) }])
                assert.equal(messages.sendMessageSchema.safeParse(body).success, false);
            await assert.rejects(proposal("blocked", guest));
            await assert.rejects(proposal("no grant", actor, noBot));
            await assert.rejects(proposal("private", actor, privateDm));
            const pending = await proposal("exact preview");
            assert.equal(pending.status, "approval_required");
            assert.equal(await countMessages(), 0);
            await assert.rejects(messages.reviewMcpMessage(outsider, pending.request_id, "approve"));
            const stillPending = await messages.sendMcpMessage(actor, input(pending));
            assert.equal(stillPending.status, "approval_required");
            assert.equal(await countMessages(), 0);
        });
        await t.test("approved send, twenty concurrent retries, transactional inbox and complete audit", async () => {
            const pending = await approved("พรุ่งนี้ให้เริ่มตรวจ Source Code");
            const results = await Promise.all(Array.from({ length: 20 }, () => messages.sendMcpMessage(actor, input(pending))));
            assert.equal(new Set(results.map(result => result.message_id)).size, 1);
            assert.equal(results.filter(result => !result.replayed).length, 1);
            const row = (await pool.query(`SELECT * FROM messages WHERE id=$1`, [results[0].message_id])).rows[0];
            assert.equal(row.sender_id, bot);
            assert.equal(row.approved_by, actor);
            assert.equal(row.bot_request_id, pending.request_id);
            assert.equal(row.content, pending.message);
            const audit = (await pool.query(`SELECT * FROM mcp_audit_logs WHERE request_id=$1 AND tool_name='send_message'`, [pending.request_id])).rows[0];
            assert.equal(audit.actor_user_id, actor);
            assert.equal(audit.bot_user_id, bot);
            assert.equal(audit.channel_id, room);
            assert.equal(audit.message_id, row.id);
            assert.ok(audit.created_at);
            assert.equal((await pool.query(`SELECT count(*)::int AS count FROM notifications WHERE source_id=$1 AND user_id=$2`, [row.id, partner])).rows[0].count, 1);
            await assert.rejects(messages.sendMcpMessage(actor, { ...input(pending), message: "changed" }));
            const route = loadSource("src/app/api/neon/chat/route.ts", { "next/server": { ...next, after: () => { throw new Error("GET must not dispatch"); } }, "@/lib/neon/auth": auth(actor), "@/lib/neon/server": database, "@/lib/notification-chat": inserts });
            const response = await route.GET(new Request(`http://localhost/api/neon/chat?mode=messages&channelId=${room}`));
            assert.equal(response.status, 200);
            const polled = (await response.json()).messages.find((item: {
                id: string;
            }) => item.id === row.id);
            assert.equal(polled.sender.account_type, "BOT");
            assert.equal(polled.sender.display_name, "เลขาคิม");
        });
        await t.test("expired approval, role changes and revoked bot access cannot send", async () => {
            const pending = await approved("revocation");
            await pool.query(`DELETE FROM workspace_bot_channels WHERE bot_user_id=$1 AND channel_id=$2`, [bot, room]);
            await assert.rejects(messages.sendMcpMessage(actor, input(pending)));
            await pool.query(`INSERT INTO workspace_bot_channels VALUES($1,$2,$3,NOW())`, [bot, room, actor]);
            await pool.query(`UPDATE profiles SET role='guest' WHERE id=$1`, [actor]);
            await assert.rejects(messages.sendMcpMessage(actor, input(pending)));
            await pool.query(`UPDATE profiles SET role='admin' WHERE id=$1`, [actor]);
            await pool.query(`UPDATE mcp_message_requests SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [pending.request_id]);
            await assert.rejects(messages.sendMcpMessage(actor, input(pending)));
        });
        await t.test("audit failure rolls back message, inbox and request status together", async () => {
            const pending = await approved("rollback");
            const before = await countMessages();
            await pool.query(`CREATE FUNCTION reject_send_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tool_name='send_message' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_send BEFORE INSERT ON mcp_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_send_audit();`);
            try {
                await assert.rejects(messages.sendMcpMessage(actor, input(pending)));
                assert.equal(await countMessages(), before);
                assert.equal((await pool.query(`SELECT status FROM mcp_message_requests WHERE id=$1`, [pending.request_id])).rows[0].status, "approved");
            }
            finally {
                await pool.query(`DROP TRIGGER reject_send ON mcp_audit_logs;DROP FUNCTION reject_send_audit()`);
            }
        });
        await t.test("bot can use an already allowed DM and never creates another DM", async () => {
            const before = (await pool.query(`SELECT count(*)::int AS count FROM channels`)).rows[0].count;
            const pending = await approved("existing DM", actor, dm);
            const sent = await messages.sendMcpMessage(actor, input(pending));
            assert.equal(sent.channel_id, dm);
            assert.equal((await pool.query(`SELECT count(*)::int AS count FROM channels`)).rows[0].count, before);
        });
        await t.test("per-actor send rate limit is enforced under DB locks", async () => {
            for (let index = 0; index < 5; index++) {
                const pending = await approved(`rate-${index}`, rateActor);
                assert.equal((await messages.sendMcpMessage(rateActor, input(pending))).status, "sent");
            }
            const over = await approved("over rate", rateActor);
            await assert.rejects(messages.sendMcpMessage(rateActor, input(over)), /ขีดจำกัด/);
        });
        await t.test("client/project writes require exact approval and do not reset unspecified fields", async () => {
            const pending = await business.runMcpClientWrite(actor, "create_client", { name: "Synthetic Client", status: "active", project_type: "web_app", idempotency_key: randomUUID() });
            assert.equal(pending.status, "approval_required");
            assert.equal((await pool.query(`SELECT count(*)::int AS count FROM clients`)).rows[0].count, 0);
            await business.reviewMcpClientWrite(actor, pending.request_id, "approve");
            const args = { ...pending.payload, idempotency_key: pending.idempotency_key };
            const created = await business.runMcpClientWrite(actor, "create_client", args);
            const replay = await business.runMcpClientWrite(actor, "create_client", args);
            assert.equal(created.result.id, replay.result.id);
            const update = await business.runMcpClientWrite(actor, "update_client", { client_id: created.result.id, changes: { name: "Updated" } });
            await business.reviewMcpClientWrite(actor, update.request_id, "approve");
            await business.runMcpClientWrite(actor, "update_client", { ...update.payload, idempotency_key: update.idempotency_key });
            const current = (await pool.query(`SELECT * FROM clients WHERE id=$1`, [created.result.id])).rows[0];
            assert.equal(current.status, "active");
            assert.equal(current.project_type, "web_app");
            const project = await business.runMcpClientWrite(actor, "create_project", { client_id: created.result.id, name: "Website phase 2" });
            await business.reviewMcpClientWrite(actor, project.request_id, "approve");
            const newProject = await business.runMcpClientWrite(actor, "create_project", { ...project.payload, idempotency_key: project.idempotency_key });
            assert.equal(newProject.result.parent_client_id, created.result.id);
            const detail = await business.getMcpClientDetails(created.result.id);
            assert.equal(detail.projects.length, 1);
            assert.equal(business.updateClientSchema.safeParse({ client_id: created.result.id, changes: { name: "x", created_by: outsider } }).success, false);
            await assert.rejects(business.runMcpClientWrite(guest, "create_client", { name: "blocked" }));
        });
        await t.test("editing a client after approval invalidates stale update requests", async () => {
            const client = (await pool.query(`SELECT id FROM clients WHERE parent_client_id IS NULL LIMIT 1`)).rows[0];
            const pending = await business.runMcpClientWrite(actor, "update_client", { client_id: client.id, changes: { status: "paused" } });
            await business.reviewMcpClientWrite(actor, pending.request_id, "approve");
            await pool.query(`UPDATE clients SET updated_at=clock_timestamp() WHERE id=$1`, [client.id]);
            await assert.rejects(business.runMcpClientWrite(actor, "update_client", { ...pending.payload, idempotency_key: pending.idempotency_key }), /เปลี่ยนหลัง/);
        });
        await t.test("mute is user-scoped, expires automatically and never replays muted inbox or Push", async () => {
            const mute = loadSource("src/app/api/neon/chat-notifications/route.ts", { "next/server": next, "@/lib/neon/auth": auth(partner), "@/lib/neon/server": database });
            const patch = (channelId: string, duration: unknown) => new Request("http://localhost/api/neon/chat-notifications", { method: "PATCH", body: JSON.stringify({ channelId, duration, userId: actor }) });
            assert.equal((await mute.PATCH(patch(privateDm, 60))).status, 404);
            assert.equal((await mute.PATCH(patch(room, -1))).status, 400);
            assert.equal((await mute.PATCH(patch(room, 15))).status, 200);
            assert.equal((await pool.query(`SELECT count(*)::int AS count FROM chat_notification_preferences WHERE user_id=$1`, [actor])).rows[0].count, 0);
            const message = (await pool.query(`INSERT INTO messages(channel_id,sender_id,content) VALUES($1,$2,'while muted') RETURNING id`, [room, bot])).rows[0];
            await inserts.insertChatMessageNotifications(pool, message.id);
            await pool.query(`UPDATE chat_notification_preferences SET muted_until=NOW()-INTERVAL '1 second' WHERE user_id=$1`, [partner]);
            const notifications = loadSource("src/app/api/neon/notifications/route.ts", { "next/server": next, "@/lib/neon/auth": auth(partner), "@/lib/neon/server": database });
            const response = await notifications.GET(new Request("http://localhost/api/neon/notifications"));
            const data = await response.json();
            assert.ok(data.unreadCount > 0);
            assert.equal(data.notifications.find((item: {
                source_id: string;
            }) => item.source_id === message.id).muted, true);
            let pushes = 0;
            const delivery = loadSource("src/lib/notification-server.ts", { "@/lib/neon/server": database, "@/lib/push-server": { sendPushToUser: async () => { pushes++; return { sent: 1 }; } } });
            await pool.query(`CREATE TABLE push_subscriptions(user_id uuid,endpoint text,p256dh text,auth text);INSERT INTO push_subscriptions VALUES('${partner}','https://push.invalid','synthetic','synthetic')`);
            await delivery.deliverNotifications([{ userId: partner, title: "Muted", body: "Text", kind: "chat", sourceType: "message", sourceId: message.id }]);
            assert.equal(pushes, 0);
            const fresh = (await pool.query(`INSERT INTO messages(channel_id,sender_id,content) VALUES($1,$2,'after expiry') RETURNING id`, [room, bot])).rows[0];
            await inserts.insertChatMessageNotifications(pool, fresh.id);
            await delivery.deliverNotifications([{ userId: partner, title: "New", body: "Text", kind: "chat", sourceType: "message", sourceId: fresh.id }]);
            assert.equal(pushes, 1);
            assert.equal((await mute.PATCH(patch(room, "forever"))).status, 200);
            assert.equal((await pool.query(`SELECT mute_forever FROM chat_notification_preferences WHERE user_id=$1`, [partner])).rows[0].mute_forever, true);
            assert.equal((await mute.PATCH(patch(room, 0))).status, 200);
        });
        await t.test("normal channel deletion still works and preserves historical audit IDs", async () => {
            const channel=randomUUID();
            await pool.query(`INSERT INTO channels(id,name,created_by) VALUES($1,'Disposable synthetic room',$2)`,[channel,actor]);
            await pool.query(`INSERT INTO workspace_bot_channels(bot_user_id,channel_id,granted_by) VALUES($1,$2,$3)`,[bot,channel,actor]);
            await pool.query(`INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2)`,[channel,bot]);
            const pending=await approved("delete-room regression",actor,channel);
            const sent=await messages.sendMcpMessage(actor,input(pending));
            await pool.query(`DELETE FROM channels WHERE id=$1`,[channel]);
            assert.equal((await pool.query(`SELECT count(*)::int AS count FROM messages WHERE id=$1`,[sent.message_id])).rows[0].count,0);
            assert.equal((await pool.query(`SELECT count(*)::int AS count FROM mcp_audit_logs WHERE tool_name='send_message' AND message_id=$1 AND channel_id=$2`,[sent.message_id,channel])).rows[0].count,1);
        });
        await t.test("real MCP SDK exposes old/new tools; reads have no write side effects", async () => {
            const task = loadSource("src/lib/mcp-create-task.ts", {});
            const serverSource = loadSource("src/lib/lcs-mcp.ts", { "next/server": { after: () => { } }, "@/lib/env": { getSiteUrl: () => "https://lcs.example.test" }, "@/lib/neon/server": database, "@/lib/github": {}, "@/lib/mcp-create-task": task, "@/lib/mcp-messages": messages, "@/lib/mcp-clients": business, "@/lib/notification-chat": inserts });
            const oldEnv = { ...process.env };
            Object.assign(process.env, env);
            const server = serverSource.createLcsMcpServer({ userId: actor, profile: { id: actor, role: "admin", display_name: "Mark" } });
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            const client = new Client({ name: "isolated-test", version: "1" });
            try {
                await server.connect(serverTransport);
                await client.connect(clientTransport);
                const tools = (await client.listTools()).tools;
                for (const name of ["get_my_profile", "get_recent_team_messages", "create_task", "list_channels", "get_channel_members", "send_message", "search_members", "create_client", "update_client", "create_project", "get_client_details"])
                    assert.ok(tools.some(tool => tool.name === name), name);
                assert.equal(tools.find(tool => tool.name === "send_message")?.annotations?.readOnlyHint, false);
                const before = await countMessages();
                const result = await client.callTool({ name: "get_recent_team_messages", arguments: { channel_id: room, limit: 20 } });
                assert.ok(!result.isError);
                assert.equal(await countMessages(), before);
                const pending = await client.callTool({ name: "send_message", arguments: { channel_id: room, message: "MCP pending only", idempotency_key: randomUUID() } });
                assert.equal((pending.structuredContent as {
                    status: string;
                }).status, "approval_required");
                assert.equal(await countMessages(), before);
            }
            finally {
                await client.close();
                await server.close();
                for (const key of Object.keys(env)) {
                    if (oldEnv[key] === undefined)
                        delete process.env[key];
                    else
                        process.env[key] = oldEnv[key];
                }
            }
        });
    }
    finally {
        await pool.end();
        await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
        await admin.end();
    }
});
