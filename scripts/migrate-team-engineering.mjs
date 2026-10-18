import fs from "node:fs";
import process from "node:process";
import pg from "pg";

const requiredTables = ["ai_conversations", "ai_messages", "mcp_audit_logs"];

function databaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw?.startsWith("postgres")) return null;
  try {
    const url = new URL(raw);
    if (url.searchParams.get("sslmode") === "require") {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

async function exactCounts(client) {
  const { rows: tables } = await client.query(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const counts = {};
  for (const { tablename } of tables) {
    const identifier = `"${String(tablename).replaceAll('"', '""')}"`;
    const result = await client.query(`SELECT count(*)::bigint AS count FROM public.${identifier}`);
    counts[tablename] = result.rows[0].count;
  }
  return counts;
}

const connectionString = databaseUrl();
const isProductionBuild = process.env.VERCEL_ENV === "production";

if (!isProductionBuild) {
  console.log("[neon-migration] Skipped: not a Vercel production build");
  process.exit(0);
}
if (!connectionString) {
  throw new Error("[neon-migration] DATABASE_URL is missing in Vercel Production");
}

const { Pool } = pg;
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 15_000,
});
const client = await pool.connect();

try {
  const before = await exactCounts(client);
  const sql = fs.readFileSync(new URL("./neon-team-engineering-workspace.sql", import.meta.url), "utf8");
  await client.query(sql);
  const after = await exactCounts(client);
  const changedExisting = Object.entries(before).filter(([table, count]) => after[table] !== count);
  const missing = requiredTables.filter((table) => !(table in after));

  if (changedExisting.length || missing.length) {
    throw new Error(
      `[neon-migration] Verification failed: changed=${JSON.stringify(changedExisting)} missing=${missing.join(",")}`,
    );
  }

  console.log(
    `[neon-migration] Ready: checked ${Object.keys(before).length} existing tables; all existing row counts preserved; required tables present`,
  );
} finally {
  client.release();
  await pool.end();
}
