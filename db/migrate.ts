#!/usr/bin/env tsx
import "dotenv/config";
import { runner } from "node-pg-migrate";
import { Client } from "pg";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, "migrations");
const MIGRATIONS_SCHEMA = "orchard_migrations";

/** Migration names as node-pg-migrate/pgmigrations records them: the file stem, sans `.up.sql`. */
export function listMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .map((f) => f.slice(0, -".up.sql".length))
    .sort();
}

/**
 * Runs every pending migration against `databaseUrl` and sets orchard_app's
 * login password (DEC-018: shared by db/migrate.ts's CLI and
 * db/test-global-setup.ts, so a fresh test-template database is migrated
 * the exact same way a real one is - no separate/parallel migration path).
 */
export async function migrateUp(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: "up",
    count: Infinity,
    migrationsTable: "pgmigrations",
    migrationsSchema: MIGRATIONS_SCHEMA,
    createMigrationsSchema: true,
    schema: ["evidence", "rwa"],
    createSchema: false,
    migrationLoaderStrategies: [{ extensions: [".sql"], loader: "sql" }],
    checkOrder: true,
    singleTransaction: true,
    verbose: true,
  });
  await setAppPassword(databaseUrl);
}

async function setAppPassword(databaseUrl: string): Promise<void> {
  const appPassword = process.env["ORCHARD_APP_DB_PASSWORD"];
  if (!appPassword) {
    console.warn(
      "[migrate] ORCHARD_APP_DB_PASSWORD not set - orchard_app role has no login password (skipping ALTER ROLE)",
    );
    return;
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // ALTER ROLE ... PASSWORD does not accept a bind parameter (DDL, not
    // DML) - the server rejects `$1` there with a syntax error. Instead,
    // ask the server to safely quote the literal via a parameterized
    // SELECT (which *does* support bind parameters), then splice that
    // pre-escaped literal into the ALTER ROLE statement. The secret value
    // itself never passes through string interpolation we control.
    const quoted = await client.query<{ lit: string }>("SELECT quote_literal($1::text) AS lit", [
      appPassword,
    ]);
    const literal = quoted.rows[0]?.lit;
    if (!literal) throw new Error("Failed to quote ORCHARD_APP_DB_PASSWORD for ALTER ROLE");
    await client.query(`ALTER ROLE orchard_app WITH LOGIN PASSWORD ${literal}`);
  } finally {
    await client.end();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function assertDestructiveMigrationAllowed(): void {
  if (process.env["ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION"] !== "1") {
    throw new Error(
      "Refusing to run `migrate down`: set ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1 to allow it. " +
        "This is a hard-to-reverse operation (DEC-013) - never set it in a real environment " +
        "outside a throwaway/CI database.",
    );
  }
}

async function main(): Promise<void> {
  const direction = process.argv[2];
  if (direction !== "up" && direction !== "down") {
    console.error("Usage: tsx db/migrate.ts <up|down> [count]");
    process.exit(1);
  }

  const databaseUrl = requireEnv("DATABASE_URL");

  if (direction === "up") {
    await migrateUp(databaseUrl);
    return;
  }

  assertDestructiveMigrationAllowed();
  const countArg = process.argv[3];
  const count = countArg !== undefined ? Number(countArg) : undefined;

  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: "down",
    count: count ?? Infinity,
    migrationsTable: "pgmigrations",
    migrationsSchema: MIGRATIONS_SCHEMA,
    createMigrationsSchema: true,
    schema: ["evidence", "rwa"],
    createSchema: false,
    migrationLoaderStrategies: [{ extensions: [".sql"], loader: "sql" }],
    checkOrder: true,
    singleTransaction: true,
    verbose: true,
  });
}

// Only run the CLI when this file is executed directly (`tsx db/migrate.ts
// <up|down>`), not when migrateUp/listMigrationNames are imported as a
// module (db/test-global-setup.ts, DEC-018) - importing must never also
// trigger argv-driven CLI behavior as a side effect.
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
