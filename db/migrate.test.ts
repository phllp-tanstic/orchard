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

describe("db/migrate.ts destructive-migration guard (DEC-013)", () => {
  it("refuses `down` when ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION is unset", () => {
    const { status, stderr } = runMigrate(["down"], {
      DATABASE_URL: FAKE_DATABASE_URL,
      ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: undefined,
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION/);
  });

  it("refuses `down` when ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION is set to something other than '1'", () => {
    const { status, stderr } = runMigrate(["down"], {
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
