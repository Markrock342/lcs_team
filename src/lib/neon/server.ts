import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

type NeonGlobals = typeof globalThis & {
  __lcsNeonPool?: Pool;
  __lcsNeonPoolAttached?: boolean;
};

const globalForNeon = globalThis as NeonGlobals;

function getDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl || !rawUrl.startsWith("postgres")) return null;

  // Neon examples commonly use sslmode=require. pg now warns for that mode
  // because it is less explicit than verify-full. Normalize it at runtime so
  // production keeps certificate and hostname verification enabled.
  try {
    const url = new URL(rawUrl);
    if (url.searchParams.get("sslmode") === "require") {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function isNeonConfigured() {
  return Boolean(getDatabaseUrl());
}

export function getNeonPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) return null;

  if (!globalForNeon.__lcsNeonPool) {
    globalForNeon.__lcsNeonPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      // Neon presents a publicly trusted certificate; keep certificate
      // verification enabled instead of relying on sslmode=require alone.
      ssl: { rejectUnauthorized: true },
    });
  }

  if (!globalForNeon.__lcsNeonPoolAttached) {
    attachDatabasePool(globalForNeon.__lcsNeonPool);
    globalForNeon.__lcsNeonPoolAttached = true;
  }

  return globalForNeon.__lcsNeonPool;
}

export async function queryNeon<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  const pool = getNeonPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  return pool.query<T>(text, values);
}

export async function withNeonTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getNeonPool();
  if (!pool) throw new Error("DATABASE_URL is not configured");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type NeonHealthSnapshot = {
  database: string;
  tableCount: number;
  profiles: number;
  clients: number;
  tasks: number;
  messages: number;
  salesProspects: number;
  legacyAuthUsers: number;
};

export async function getNeonHealthSnapshot(): Promise<NeonHealthSnapshot> {
  const { rows } = await queryNeon<NeonHealthSnapshot>(`
    SELECT
      current_database() AS database,
      (
        SELECT count(*)::int
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ) AS "tableCount",
      (SELECT count(*)::int FROM public.profiles) AS profiles,
      (SELECT count(*)::int FROM public.clients) AS clients,
      (SELECT count(*)::int FROM public.tasks) AS tasks,
      (SELECT count(*)::int FROM public.messages) AS messages,
      (SELECT count(*)::int FROM public.sales_prospects) AS "salesProspects",
      (SELECT count(*)::int FROM public.legacy_auth_users) AS "legacyAuthUsers"
  `);

  const snapshot = rows[0];
  if (!snapshot) throw new Error("Neon health query returned no rows");
  return snapshot;
}
