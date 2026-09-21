import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";

/**
 * Per-file integration test database isolation (DEC-017/DEC-018). See
 * docs/MILESTONE_STATUS.md's "Integration-test deadlock" incident: two
 * integration test files sharing one database let an owner-role TRUNCATE
 * negative control (kept - see DEC-010/DEC-013) lock-order-invert against a
 * concurrent INSERT in a different file. No two files may ever connect to
 * the same database again.
 *
 * db/test-global-setup.ts builds one fully-migrated template database once
 * per `pnpm test:integration` run, directly (never cloned from the
 * developer's app database - DEC-018). Each test file then clones its own
 * database from that template here, and drops it in afterAll - including on
 * failure, since afterAll always runs.
 */

export const TEMPLATE_DB_NAME = "orchard_test_template";
/** Postgres's own always-present administrative database - never the app db itself, so CREATE/DROP DATABASE always has somewhere neutral to run from. */
export const MAINTENANCE_DB_NAME = "postgres";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for integration tests`);
  return value;
}

/** Swaps the database name (path) in a Postgres connection string, keeping host/user/etc. */
export function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function withMaintenanceClient<T>(
  adminConnectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: withDatabase(adminConnectionString, MAINTENANCE_DB_NAME),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export interface IsolatedDatabase {
  /** Connects as the migrator/admin (bootstrap) role - used for owner-role negative controls. */
  migratorPool: Pool;
  /** Connects as orchard_app - the least-privileged application role. */
  appPool: Pool;
  /** Ends both pools and drops this file's database. Call from afterAll. */
  teardown(): Promise<void>;
}

/**
 * Creates a fresh database (cloned from the template) for the calling test
 * file, and pools for both roles pointed at it. Role passwords are
 * cluster-wide (not per-database), so orchard_app's login set by
 * db/migrate.ts's setAppPassword() already works against this new database
 * with no extra setup.
 */
export async function createIsolatedDatabase(): Promise<IsolatedDatabase> {
  const adminConnectionString = requireEnv("DATABASE_URL");
  const appConnectionString = requireEnv("ORCHARD_APP_DATABASE_URL");
  const dbName = `orchard_test_${randomUUID().replace(/-/g, "")}`;

  await withMaintenanceClient(adminConnectionString, async (client) => {
    await client.query(
      `CREATE DATABASE ${quoteIdent(dbName)} TEMPLATE ${quoteIdent(TEMPLATE_DB_NAME)}`,
    );
  });

  const migratorPool = new Pool({ connectionString: withDatabase(adminConnectionString, dbName) });
  const appPool = new Pool({ connectionString: withDatabase(appConnectionString, dbName) });

  return {
    migratorPool,
    appPool,
    teardown: async () => {
      await Promise.all([migratorPool.end(), appPool.end()]);
      await withMaintenanceClient(adminConnectionString, async (client) => {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)} WITH (FORCE)`);
      });
    },
  };
}
