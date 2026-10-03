import "server-only";
import { Pool } from "pg";
import { serverEnv } from "./env";

/**
 * One pg Pool for the process (F003 section 4 requires exactly one server
 * instance, so one pool is the whole story). Connects as orchard_app, the
 * least-privileged role: SELECT and INSERT only, no UPDATE or DELETE anywhere.
 */
let pool: Pool | undefined;

export function db(): Pool {
  if (pool !== undefined) return pool;
  pool = new Pool({
    connectionString: serverEnv().ORCHARD_APP_DATABASE_URL,
    // Public traffic is bounded by the concurrency budget, not by the pool, so
    // a small pool is enough and keeps the database side predictable.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

/** Test-only. Closes and clears the pool so a suite can exit cleanly. */
export async function closeDbForTests(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
  }
}
