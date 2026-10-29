import fs from "node:fs";
import { createECDH } from "node:crypto";
import process from "node:process";
import pg from "pg";
import { runVerifiedMigration } from "./verified-migration.mjs";

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

async function verifyChatNotificationSchema(client) {
  const required = {
    notifications: ["user_id", "title", "body", "link", "read", "source_type", "source_id", "push_sent", "created_at"],
    profiles: ["id", "display_name", "notify_chat", "notify_mentions", "notify_tasks", "push_enabled"],
    messages: ["id", "channel_id", "sender_id", "content", "file_name", "deleted_at", "mentioned_ids"],
    channels: ["id", "name", "kind", "created_by"],
    channel_members: ["channel_id", "user_id"],
  };
  const { rows: columns } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=ANY($1::text[])`,
    [Object.keys(required)],
  );
  const missing = Object.entries(required).flatMap(([table, names]) =>
    names.filter((name) => !columns.some((column) => column.table_name === table && column.column_name === name))
      .map((name) => `${table}.${name}`),
  );
  const { rows: indexes } = await client.query(
    `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='notifications'`,
  );
  const dedupeIndex = indexes.some(({ indexdef }) =>
    indexdef.includes("UNIQUE") && /\(user_id, source_type, source_id\)/.test(indexdef),
  );
  if (missing.length || !dedupeIndex) {
    throw new Error(`[chat-notifications] Schema not ready: missing=${missing.join(",") || "none"}; deduplication index=${dedupeIndex}`);
  }
  console.log("[chat-notifications] Ready: required columns and deduplication index verified");
}

function verifyPushConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    console.warn("[push-config] Not ready: VAPID public/private key missing");
    return;
  }
  try {
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (!curve.getPublicKey().equals(Buffer.from(publicKey, "base64url"))) throw new Error("mismatch");
    console.log("[push-config] Ready: VAPID key pair verified (browser permission and push service access still required)");
  } catch {
    console.warn("[push-config] Not ready: invalid or mismatched VAPID keys");
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
  verifyPushConfiguration();
  await verifyChatNotificationSchema(client);
  const engineeringSql = fs.readFileSync(new URL("./neon-team-engineering-workspace.sql", import.meta.url), "utf8");
  const tagsSql = fs.readFileSync(new URL("./neon-custom-team-tags.sql", import.meta.url), "utf8");
  const sql = engineeringSql.replace(/COMMIT;\s*$/i, `${tagsSql}\nCOMMIT;\n`);
  const checked = await runVerifiedMigration(client, sql, exactCounts, requiredTables);
  console.log(
    `[neon-migration] Ready: checked ${checked} existing tables in one snapshot; all existing row counts preserved; required tables present`,
  );
} finally {
  client.release();
  await pool.end();
}
