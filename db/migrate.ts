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
    schema: ["evidence", "rwa", "execution"],
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

export const USAGE = [
  "Usage:",
  "  tsx db/migrate.ts up",
  "  tsx db/migrate.ts down <count>          # count is REQUIRED, e.g. `down 1`",
  "  tsx db/migrate.ts reset --confirm <databaseName>",
  "",
  "`down` needs ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1.",
  "`reset` rolls back EVERY migration and needs ORCHARD_ALLOW_FULL_RESET=1.",
].join("\n");

export type RefusalCode =
  | "USAGE"
  | "DOWN_WITHOUT_COUNT"
  | "DOWN_BAD_COUNT"
  | "DOWN_NOT_ALLOWED"
  | "RESET_WITHOUT_CONFIRM"
  | "RESET_NAME_MISMATCH"
  | "RESET_NOT_ALLOWED";

/** A refusal, not a crash: the command was understood and declined. */
export class MigrationRefused extends Error {
  constructor(
    readonly code: RefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "MigrationRefused";
  }
}

export type MigrationPlan =
  { action: "up" } | { action: "down"; count: number } | { action: "reset" };

/**
 * Decides what a command line means, or refuses it. Pure, so every refusal can
 * be tested without a database - which matters, because the refusals ARE the
 * feature.
 *
 * Why `down` now requires an explicit count: node-pg-migrate's default is
 * "all", and this CLI passed `count ?? Infinity`. A bare `pnpm migrate:down`
 * therefore rolled back EVERY migration, which is what destroyed a local
 * evidence database during F003 - the operator believed it stepped back one.
 * An irreversible default is the wrong default; the count is now mandatory and
 * a full rollback has its own verb.
 *
 * `reset` is deliberately awkward: a separate verb, a separate environment
 * variable, and the database NAME typed back. Nobody reaches a full reset by
 * repeating a command they have run before.
 */
export function planMigration(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  actualDatabaseName: string,
): MigrationPlan {
  const action = argv[0];

  if (action === "up") return { action: "up" };

  if (action === "down") {
    const countArg = argv[1];
    if (countArg === undefined || countArg === "") {
      throw new MigrationRefused(
        "DOWN_WITHOUT_COUNT",
        "Refusing to run `migrate down` with no count. Say how many migrations to roll back, " +
          "e.g. `pnpm migrate:down 1`. A bare `down` used to roll back EVERY migration, which " +
          "is how a local evidence database was destroyed. To roll everything back on purpose, " +
          "use `migrate reset --confirm <databaseName>`.",
      );
    }
    if (!/^[1-9]\d*$/.test(countArg)) {
      throw new MigrationRefused(
        "DOWN_BAD_COUNT",
        `Refusing to run \`migrate down ${countArg}\`: the count must be a positive whole ` +
          "number. `all`, `0`, `-1` and `Infinity` are not accepted - use " +
          "`migrate reset --confirm <databaseName>` to roll everything back.",
      );
    }
    if (env["ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION"] !== "1") {
      throw new MigrationRefused(
        "DOWN_NOT_ALLOWED",
        "Refusing to run `migrate down`: set ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1 to allow it. " +
          "This is a hard-to-reverse operation (DEC-013) - never set it in a real environment " +
          "outside a throwaway/CI database.",
      );
    }
    return { action: "down", count: Number(countArg) };
  }

  if (action === "reset") {
    if (argv[1] !== "--confirm" || argv[2] === undefined || argv[2] === "") {
      throw new MigrationRefused(
        "RESET_WITHOUT_CONFIRM",
        "Refusing to run `migrate reset` without confirmation. This rolls back EVERY migration " +
          `and destroys all stored evidence. Re-run as: migrate reset --confirm ${actualDatabaseName}`,
      );
    }
    if (argv[2] !== actualDatabaseName) {
      throw new MigrationRefused(
        "RESET_NAME_MISMATCH",
        `Refusing to run \`migrate reset\`: you confirmed "${argv[2]}" but DATABASE_URL points ` +
          `at "${actualDatabaseName}". The names must match exactly, so a reset cannot be ` +
          "pasted from another terminal and land on the wrong database.",
      );
    }
    if (env["ORCHARD_ALLOW_FULL_RESET"] !== "1") {
      throw new MigrationRefused(
        "RESET_NOT_ALLOWED",
        "Refusing to run `migrate reset`: set ORCHARD_ALLOW_FULL_RESET=1 to allow it. This is " +
          "separate from ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION on purpose - permission to step " +
          "back one migration is not permission to destroy the whole evidence store.",
      );
    }
    return { action: "reset" };
  }

  throw new MigrationRefused("USAGE", USAGE);
}

/** The database a connection string points at, for the reset confirmation. */
export function databaseNameOf(connectionString: string): string {
  try {
    return new URL(connectionString).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

/** Append-only tables whose contents a reset would destroy. */
const EVIDENCE_TABLES = [
  "evidence.probe_run",
  "evidence.probe_run_event",
  "evidence.provider_call",
  "rwa.platform_snapshot",
  "rwa.token_snapshot",
  "execution.execution_request",
  "execution.candidate_route",
  "execution.route_decision",
];

/**
 * Prints what a reset is about to destroy, BEFORE destroying it. A count is
 * the one piece of information that makes the decision real: "0 rows" and
 * "488 rows" deserve different answers, and the operator is the only one who
 * can tell which this is.
 */
async function reportResetTarget(databaseUrl: string, databaseName: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.warn(`[migrate reset] database: ${databaseName}`);
    console.warn("[migrate reset] about to roll back EVERY migration. Row counts now:");
    for (const table of EVIDENCE_TABLES) {
      let count: string;
      try {
        const res = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
        count = res.rows[0]?.n ?? "?";
      } catch {
        // A table that does not exist yet is not an error here; a partially
        // migrated database is a normal thing to reset.
        count = "(table absent)";
      }
      console.warn(`[migrate reset]   ${table}: ${count}`);
    }
  } finally {
    await client.end();
  }
}

async function runDown(databaseUrl: string, count: number): Promise<void> {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: "down",
    count,
    migrationsTable: "pgmigrations",
    migrationsSchema: MIGRATIONS_SCHEMA,
    createMigrationsSchema: true,
    schema: ["evidence", "rwa", "execution"],
    createSchema: false,
    migrationLoaderStrategies: [{ extensions: [".sql"], loader: "sql" }],
    checkOrder: true,
    singleTransaction: true,
    verbose: true,
  });
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const databaseName = databaseNameOf(databaseUrl);

  let plan: MigrationPlan;
  try {
    plan = planMigration(process.argv.slice(2), process.env, databaseName);
  } catch (err) {
    if (err instanceof MigrationRefused) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  if (plan.action === "up") {
    await migrateUp(databaseUrl);
    return;
  }

  if (plan.action === "down") {
    await runDown(databaseUrl, plan.count);
    return;
  }

  await reportResetTarget(databaseUrl, databaseName);
  // Infinity here is explicit and asked for by name, which is the whole
  // difference between this and what `down` used to do by default.
  await runDown(databaseUrl, Infinity);
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
