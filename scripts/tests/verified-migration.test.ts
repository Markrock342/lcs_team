import assert from "node:assert/strict";
import test from "node:test";
import { runVerifiedMigration } from "../verified-migration.mjs";

const sql = "BEGIN;\nCREATE TABLE IF NOT EXISTS ai_messages (id int);\nCOMMIT;";

test("migration compares a single snapshot while chat traffic continues", async () => {
  const commands: string[] = [];
  let liveCount = 10;
  let snapshot = 0;
  let migrated = false;
  const client = { query: async (command: string) => {
    commands.push(command);
    if (command === "BEGIN ISOLATION LEVEL REPEATABLE READ") snapshot = liveCount;
    if (command.includes("CREATE TABLE")) { migrated = true; liveCount += 5; }
  } };
  const checked = await runVerifiedMigration(client, sql, async () => ({ messages: String(snapshot), ...(migrated ? { ai_messages: "0" } : {}) }), ["ai_messages"]);
  assert.equal(checked, 1);
  assert.equal(liveCount, 15);
  assert.equal(commands.at(-1), "COMMIT");
  assert.equal(commands.filter((command) => command.includes("COMMIT")).length, 1);
  assert.ok(!commands.includes("ROLLBACK"));
});

test("migration changes to existing data roll back before commit", async () => {
  const commands: string[] = [];
  let reads = 0;
  await assert.rejects(runVerifiedMigration(
    { query: async (command: string) => { commands.push(command); } }, sql,
    async () => ({ messages: String(++reads === 1 ? 10 : 9), ai_messages: "0" }), ["ai_messages"],
  ), /Verification failed/);
  assert.equal(commands.at(-1), "ROLLBACK");
  assert.ok(!commands.includes("COMMIT"));
});

test("missing required tables roll back and nested commits are rejected", async () => {
  const commands: string[] = [];
  const client = { query: async (command: string) => { commands.push(command); } };
  await assert.rejects(runVerifiedMigration(client, sql, async () => ({ messages: "10" }), ["ai_messages"]), /missing=ai_messages/);
  assert.equal(commands.at(-1), "ROLLBACK");
  const count = commands.length;
  await assert.rejects(runVerifiedMigration(client, "BEGIN; COMMIT; SELECT 1; COMMIT;", async () => ({}), []), /Nested transaction/);
  assert.equal(commands.length, count);
});

test("a release may explicitly allow exactly one bot profile and no other row changes", async () => {
  let snapshot=0;
  await runVerifiedMigration({query:async()=>{}},sql,async()=>++snapshot===1?{profiles:"4",messages:"20"}:{profiles:"5",messages:"20"},[],{profiles:1});
  snapshot=0;
  await assert.rejects(runVerifiedMigration({query:async()=>{}},sql,async()=>++snapshot===1?{profiles:"4",messages:"20"}:{profiles:"5",messages:"21"},[],{profiles:1}),/Verification failed/);
});

test("migration permits PL/pgSQL blocks while still rejecting SQL-level commits", async () => {
  const block="BEGIN; DO $$ DECLARE value int; BEGIN value:=1; END $$; COMMIT;";
  await runVerifiedMigration({query:async()=>{}},block,async()=>({profiles:"1"}),[]);
  await assert.rejects(runVerifiedMigration({query:async()=>{}},"BEGIN; DO $$ BEGIN NULL; END $$; COMMIT; SELECT 1; COMMIT;",async()=>({}),[]),/Nested transaction/);
});
