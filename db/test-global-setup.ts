import "dotenv/config";
import { Client } from "pg";
import {
  TEMPLATE_DB_NAME,
  quoteIdent,
  withDatabase,
  withMaintenanceClient,
} from "../packages/evidence/src/testing/isolation.js";
import { listMigrationNames, migrateUp } from "./migrate.js";

/**
 * Vitest globalSetup for `pnpm test:integration` (DEC-018, superseding
 * DEC-017's clone-from-the-app-db approach). Builds orchard_test_template as
 * a fresh, empty database and migrates it directly - it must never depend
 * on, read from, or clone the developer's app database, so the suite works
 * even when that database is un-migrated or has another session open on it.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for integration tests`);
  return value;
}

/**
 * Drops leftover per-file test databases (never the template) abandoned by
 * a crashed prior run - but only ones nothing is currently connected to.
 */
async function dropStaleTestDatabases(adminConnectionString: string): Promise<void> {
  await withMaintenanceClient(adminConnectionString, async (client) => {
    const stale = await client.query<{ datname: string }>(
      `SELECT d.datname FROM pg_database d
       WHERE d.datname LIKE 'orchard_test\\_%' ESCAPE '\\'
         AND d.datname <> $1
         AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)`,
      [TEMPLATE_DB_NAME],
    );
    for (const { datname } of stale.rows) {
      try {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(datname)}`);
      } catch (err) {
        // A session may have connected between the check above and this
        // DROP; leave it for the next run rather than forcing it away.
        console.warn(`[test-global-setup] could not drop stale database ${datname}:`, err);
      }
    }
  });
}

async function buildTemplateDatabase(adminConnectionString: string): Promise<void> {
  await withMaintenanceClient(adminConnectionString, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(TEMPLATE_DB_NAME)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoteIdent(TEMPLATE_DB_NAME)}`);
  });

  const templateConnectionString = withDatabase(adminConnectionString, TEMPLATE_DB_NAME);
  await migrateUp(templateConnectionString);

  const client = new Client({ connectionString: templateConnectionString });
  await client.connect();
  try {
    const applied = await client.query<{ name: string }>(
      `SELECT name FROM orchard_migrations.pgmigrations ORDER BY name`,
    );
    const appliedNames = applied.rows.map((r) => r.name).sort();
    const expectedNames = listMigrationNames();
    const matches =
      appliedNames.length === expectedNames.length &&
      appliedNames.every((name, i) => name === expectedNames[i]);
    if (!matches) {
      throw new Error(
        `orchard_test_template's applied migrations do not match db/migrations: ` +
          `applied=[${appliedNames.join(", ")}] expected=[${expectedNames.join(", ")}]`,
      );
    }
  } finally {
    await client.end();
  }
}

async function dropTemplateDatabase(adminConnectionString: string): Promise<void> {
  await withMaintenanceClient(adminConnectionString, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(TEMPLATE_DB_NAME)} WITH (FORCE)`);
  });
}

export default async function setup(): Promise<() => Promise<void>> {
  const adminConnectionString = requireEnv("DATABASE_URL");
  await dropStaleTestDatabases(adminConnectionString);
  await buildTemplateDatabase(adminConnectionString);
  return async () => {
    await dropTemplateDatabase(adminConnectionString);
  };
}
