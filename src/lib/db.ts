import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { Pool, TypeOverrides, type PoolClient, type QueryResultRow } from "pg";

import { requireUser } from "@/lib/auth";
import { serverEnv } from "@/lib/server-env";

/**
 * Database access for the app. Every query runs inside withUser() (or
 * asSignedOut()), which opens a transaction, switches to the request role
 * and records who is signed in, so the Row Level Security policies in
 * db/migrations decide what each query can see or change.
 *
 * The pool logs in as taskforge_app, which has no table access of its own:
 * a query that somehow skipped those steps fails instead of seeing
 * everyone's data.
 */

// Postgres types the app wants as plain strings, the same shape the
// previous API returned: dates stay "2026-11-03" (no timezone shifting),
// timestamps become ISO strings, and counts become numbers.
const DATE = 1082;
const TIMESTAMPTZ = 1184;
const INT8 = 20;
const parsers = new TypeOverrides();
parsers.setTypeParser(DATE, (value: string) => value);
parsers.setTypeParser(TIMESTAMPTZ, (value: string) => new Date(value).toISOString());
parsers.setTypeParser(INT8, (value: string) => Number(value));

const pool = new Pool({ connectionString: serverEnv.DATABASE_URL, max: 5, types: parsers });

// On Vercel, closes idle connections before a function is paused (no effect locally).
attachDatabasePool(pool);

pool.on("error", (error) => {
  // An idle connection dropped (for example the database restarted); the pool replaces it.
  console.error(JSON.stringify({ level: "error", context: "db.pool", message: error.message }));
});

/** What callers get inside withUser(): one method, rows typed by the caller. */
export type Db = {
  query<Row extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<Row[]>;
};

async function inRequestTransaction<T>(role: "authenticated" | "anon", userId: string | null, work: (db: Db) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("begin");
    // "local" settings end with the transaction, so nothing leaks to the
    // next request that borrows this connection.
    await client.query(role === "authenticated" ? "set local role authenticated" : "set local role anon");
    await client.query("select set_config('request.jwt.claims', $1, true)", [userId ? JSON.stringify({ sub: userId }) : ""]);

    const db: Db = {
      async query<Row extends QueryResultRow>(text: string, values?: readonly unknown[]) {
        const result = await client.query<Row>(text, values ? [...values] : undefined);
        return result.rows;
      },
    };
    const result = await work(db);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Runs queries as the signed-in user, in one transaction. */
export function withUser<T>(userId: string, work: (db: Db) => Promise<T>): Promise<T> {
  return inRequestTransaction("authenticated", userId, work);
}

/** Runs queries as whoever is signed in; signed-out visitors are sent to sign in. */
export async function asCurrentUser<T>(work: (db: Db) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUser(user.id, work);
}

/** The outcome of a write that the database may refuse (a rule, a permission, a constraint). */
export type Attempt<T> = { ok: true; value: T } | { ok: false; error: { code?: string; message: string } };

/**
 * Like asCurrentUser(), but a database error comes back as a value instead
 * of being thrown, so a Server Action can turn it into a friendly message
 * (see toUserMessage). Nothing is saved when it fails.
 */
export async function attemptAsCurrentUser<T>(work: (db: Db) => Promise<T>): Promise<Attempt<T>> {
  const user = await requireUser();
  try {
    return { ok: true, value: await withUser(user.id, work) };
  } catch (error) {
    return { ok: false, error: asDatabaseError(error) };
  }
}

/** Runs queries as a signed-out visitor (the health check, for example). */
export function asSignedOut<T>(work: (db: Db) => Promise<T>): Promise<T> {
  return inRequestTransaction("anon", null, work);
}

/**
 * Runs the daily clean-up (purge_expired_records) as the app's own login,
 * with no user. Only the scheduled job route calls this.
 */
export async function purgeExpiredRecords(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ removed: Record<string, number> }>("select public.purge_expired_records() as removed");
  return rows[0]?.removed ?? {};
}

/** Normalises a thrown database error for toUserMessage(). */
export function asDatabaseError(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return { code, message: error.message };
  }
  return { message: String(error) };
}
