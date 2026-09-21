import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

/**
 * Migration 007 (DEC-014 option 1): orchard_migrator is created explicitly
 * and owns every evidence/rwa schema object, independent of whichever role
 * actually runs migrations (dev: POSTGRES_USER; CI: the service container's
 * user; eventually Supabase's admin role). Verifies the role exists and
 * ownership landed on it, not on current_user.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for integration tests`);
  return value;
}

const migratorPool = new Pool({ connectionString: requireEnv("DATABASE_URL") });

afterAll(async () => {
  await migratorPool.end();
});

describe("orchard_migrator bootstrap (DEC-014, migration 007)", () => {
  it("creates the orchard_migrator role", async () => {
    const result = await migratorPool.query<{ rolname: string }>(
      `SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = 'orchard_migrator'`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it("owns the evidence and rwa schemas", async () => {
    const result = await migratorPool.query<{ nspname: string; owner: string }>(
      `SELECT nspname, pg_get_userbyid(nspowner) AS owner
       FROM pg_namespace WHERE nspname IN ('evidence', 'rwa') ORDER BY nspname`,
    );
    expect(result.rows).toEqual([
      { nspname: "evidence", owner: "orchard_migrator" },
      { nspname: "rwa", owner: "orchard_migrator" },
    ]);
  });

  it("owns every evidence/rwa table and view, regardless of which role ran the migration", async () => {
    const result = await migratorPool.query<{ relname: string; owner: string }>(
      `SELECT relname, pg_get_userbyid(relowner) AS owner
       FROM pg_class
       WHERE relnamespace IN ('evidence'::regnamespace, 'rwa'::regnamespace)
         AND relkind IN ('r', 'v')
       ORDER BY relname`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.owner).toBe("orchard_migrator");
    }
  });

  it("owns the append-only trigger functions", async () => {
    const result = await migratorPool.query<{ proname: string; owner: string }>(
      `SELECT proname, pg_get_userbyid(proowner) AS owner
       FROM pg_proc
       WHERE pronamespace = 'evidence'::regnamespace
         AND proname IN ('reject_mutation', 'reject_event_after_terminal')
       ORDER BY proname`,
    );
    expect(result.rows).toEqual([
      { proname: "reject_event_after_terminal", owner: "orchard_migrator" },
      { proname: "reject_mutation", owner: "orchard_migrator" },
    ]);
  });
});
