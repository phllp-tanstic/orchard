import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATE_SCRIPT = fileURLToPath(new URL("./migrate.ts", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
// Built from parts (never a contiguous literal in this source file) so this
// test file itself doesn't trip the postgres-connection-string-password rule.
const FAKE_DATABASE_URL = ["postgres://unused:", "unused", "@localhost:5432/unused"].join("");

/**
 * Spawns the real script (rather than importing it) because
 * db/migrate.ts runs main() at module load, and we want to exercise the
 * actual CLI entry point's guard, not a refactored-out unit. Uses `node
 * --import tsx` directly (not the tsx.cmd/tsx shell wrapper) so this works
 * without shell:true, which does not escape a path containing spaces.
 */
function runMigrate(
  args: string[],
  env: Record<string, string | undefined>,
): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", MIGRATE_SCRIPT, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
  });
  return { status: result.status, stderr: result.stderr };
}

/**
 * The guard, exercised through the REAL CLI entry point.
 *
 * db/migrate-cli.test.ts covers every refusal against the pure planner, which
 * is where the exhaustive cases live. This file keeps spawning the actual
 * script, because the thing worth proving here is that the wiring - argv, env,
 * exit code - is hooked up at all. A perfect planner behind a CLI that ignores
 * it would pass one file and fail the operator.
 *
 * `down 1`, not a bare `down`: since F003 hardening item 5 a bare `down` is
 * refused for a different and earlier reason (no count), so passing a count is
 * what actually reaches the permission gate.
 */
describe("db/migrate.ts destructive-migration guard (DEC-013)", () => {
  it("refuses `down 1` when ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION is unset", () => {
    const { status, stderr } = runMigrate(["down", "1"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: undefined,
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION/);
  });

  it("refuses `down 1` when ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION is set to something other than '1'", () => {
    const { status, stderr } = runMigrate(["down", "1"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: "true",
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION/);
  });

  it("does not raise the destructive-migration guard for `up`", () => {
    const { stderr } = runMigrate(["up"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: undefined,
    });
    // Fails for other reasons (no real DB at that address) but never the guard.
    expect(stderr).not.toMatch(/ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION/);
  });
});

describe("db/migrate.ts refuses a count-less rollback through the real CLI (item 5)", () => {
  it("refuses a BARE `down` even with permission granted", () => {
    // The incident: a bare `down` rolled back every migration. Permission to
    // roll back one is not permission to roll back all of them.
    const { status, stderr } = runMigrate(["down"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: "1",
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/no count/);
    expect(stderr).toMatch(/reset --confirm/);
  });

  it("refuses `down all`", () => {
    const { status, stderr } = runMigrate(["down", "all"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: "1",
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/positive whole number/);
  });

  it("refuses `reset` without the confirmation, naming the database", () => {
    const { status, stderr } = runMigrate(["reset"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_FULL_RESET: "1",
    });
    expect(status).not.toBe(0);
    // FAKE_DATABASE_URL points at a database called "unused".
    expect(stderr).toMatch(/--confirm unused/);
  });

  it("refuses `reset --confirm` for the WRONG database name", () => {
    const { status, stderr } = runMigrate(["reset", "--confirm", "orchard"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_FULL_RESET: "1",
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/must match exactly/);
  });

  it("refuses a correctly confirmed `reset` without ORCHARD_ALLOW_FULL_RESET", () => {
    const { status, stderr } = runMigrate(["reset", "--confirm", "unused"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      // The down permission is deliberately NOT enough for a full reset.
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: "1",
      ORCHARD_ALLOW_FULL_RESET: undefined,
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/ORCHARD_ALLOW_FULL_RESET=1/);
  });

  it("refuses an unknown verb with usage", () => {
    const { status, stderr } = runMigrate(["sideways"], { DATABASE_URL: FAKE_DATABASE_URL });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/Usage:/);
    expect(stderr).toMatch(/down <count>/);
  });
});

/**
 * CI #76: `pnpm migrate:reset -- --confirm X` failed, because pnpm forwards the
 * `--` to the script literally and the CLI saw `reset -- --confirm X`.
 *
 * These go through the real spawned CLI rather than the planner, because the
 * separator is introduced by the SHELL and the runner - the exact layer a pure
 * unit test cannot observe.
 */
describe("db/migrate.ts tolerates the argument separator pnpm forwards (CI #76)", () => {
  it("gets PAST the confirmation check with `reset -- --confirm <db>`", () => {
    const { stderr } = runMigrate(["reset", "--", "--confirm", "unused"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_FULL_RESET: undefined,
    });
    // It must now fail on the PERMISSION, not on the confirmation - proving the
    // separator no longer swallows the arguments behind it.
    expect(stderr).toMatch(/ORCHARD_ALLOW_FULL_RESET=1/);
    expect(stderr).not.toMatch(/without confirmation/);
  });

  it("gets PAST the count check with `down -- 1`", () => {
    const { stderr } = runMigrate(["down", "--", "1"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: undefined,
    });
    expect(stderr).toMatch(/ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION/);
    expect(stderr).not.toMatch(/no count/);
  });

  it("still refuses a count-less `down --`", () => {
    const { status, stderr } = runMigrate(["down", "--"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: "1",
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/no count/);
  });

  it("still refuses the WRONG database name behind a separator", () => {
    const { status, stderr } = runMigrate(["reset", "--", "--confirm", "orchard"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_FULL_RESET: "1",
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/must match exactly/);
  });
});
