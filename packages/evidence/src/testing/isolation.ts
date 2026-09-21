import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";

/**
 * Per-file integration test database isolation (DEC-017). See
 * docs/MILESTONE_STATUS.md's "Integration-test deadlock" incident: two
 * integration test files sharing one database let an owner-role TRUNCATE
 * negative control (kept - see DEC-010/DEC-013) lock-order-invert against a
 * concurrent INSERT in a different file. No two files may ever connect to
 * the same database again.
 *
 * globalSetup (globalSetup.ts in this directory) builds one fully-migrated
 * template database once per `pnpm test:integration` run. Each test file
 * then clones its own database from that template here, and drops it in
 * afterAll - including on failure, since afterAll always runs.
 */

export const TEMPLATE_DB_NAME = "orchard_test_template";
/** Postgres's own always-present administrative database - never the app db itself, so CREATE/DROP DATABASE always has somewhere neutral to run from. */
const MAINTENANCE_DB_NAME = "postgres";

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

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function withMaintenanceClient<T>(
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

/**
 * globalSetup: (re)builds the template database from the already-migrated
 * app database (DATABASE_URL's own database - `pnpm migrate:up` runs before
 * `pnpm test:integration` in both ci.yml and local dev). Requires no other
 * open connections to that app database at this moment, per Postgres's
 * CREATE DATABASE ... TEMPLATE rules - globalSetup runs once, before any
 * test file opens a connection, so that's always true in practice.
 */
export async function buildTemplateDatabase(): Promise<void> {
  const adminConnectionString = requireEnv("DATABASE_URL");
  const sourceDbName = new URL(adminConnectionString).pathname.replace(/^\//, "");
  await withMaintenanceClient(adminConnectionString, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(TEMPLATE_DB_NAME)} WITH (FORCE)`);
    await client.query(
      `CREATE DATABASE ${quoteIdent(TEMPLATE_DB_NAME)} TEMPLATE ${quoteIdent(sourceDbName)}`,
    );
  });
}

/** globalTeardown: removes the template database once the whole run is done. */
export async function dropTemplateDatabase(): Promise<void> {
  const adminConnectionString = requireEnv("DATABASE_URL");
  await withMaintenanceClient(adminConnectionString, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(TEMPLATE_DB_NAME)} WITH (FORCE)`);
  });
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
