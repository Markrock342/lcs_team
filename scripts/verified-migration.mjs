/** Compare only this migration's writes; concurrent app traffic uses its own snapshot. */
export async function runVerifiedMigration(client, sql, readCounts, requiredTables) {
  if (!/^\s*BEGIN;[\s\S]*COMMIT;\s*$/i.test(sql)) {
    throw new Error("[neon-migration] Expected a standalone BEGIN/COMMIT migration");
  }
  const body = sql.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
  if (/(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(body)) {
    throw new Error("[neon-migration] Nested transaction control is not supported");
  }

  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  try {
    const before = await readCounts(client);
    await client.query(body);
    const after = await readCounts(client);
    const changed = Object.entries(before).filter(([table, count]) => after[table] !== count);
    const missing = requiredTables.filter((table) => !(table in after));
    if (changed.length || missing.length) {
      throw new Error(`[neon-migration] Verification failed: changed=${JSON.stringify(changed)} missing=${missing.join(",")}`);
    }
    await client.query("COMMIT");
    return Object.keys(before).length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
