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
