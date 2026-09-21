#!/usr/bin/env tsx
import "dotenv/config";
import { runner } from "node-pg-migrate";
import { Client } from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "migrations");
const MIGRATIONS_SCHEMA = "orchard_migrations";

async function setAppPassword(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
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

async function main(): Promise<void> {
  const direction = process.argv[2];
  if (direction !== "up" && direction !== "down") {
    console.error("Usage: tsx db/migrate.ts <up|down> [count]");
    process.exit(1);
  }
  const countArg = process.argv[3];
  const count = countArg !== undefined ? Number(countArg) : undefined;

  const databaseUrl = requireEnv("DATABASE_URL");

  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction,
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

  if (direction === "up") {
    await setAppPassword();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
