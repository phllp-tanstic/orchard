import { describe, expect, it } from "vitest";
import {
  MigrationRefused,
  USAGE,
  databaseNameOf,
  planMigration,
  type RefusalCode,
} from "./migrate.js";

/**
 * The migrate CLI's refusals (F003 hardening item 5).
 *
 * These exist because of a real incident: `pnpm migrate:down` passed
 * `count ?? Infinity` to node-pg-migrate, so a bare `down` rolled back EVERY
 * migration and emptied a local evidence database. The operator believed it
 * stepped back one.
 *
 * Every refusal is tested, because the refusals are the feature. `planMigration`
 * is pure, so none of this needs a database - which also means there is no
 * excuse for leaving a path untested.
 */

const DB = "orchard";
const ALLOW_DOWN = { ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: "1" };
const ALLOW_RESET = { ORCHARD_ALLOW_FULL_RESET: "1" };

function refusal(
  argv: string[],
  env: Record<string, string | undefined> = {},
  databaseName = DB,
): MigrationRefused {
  try {
    planMigration(argv, env, databaseName);
  } catch (err) {
    if (err instanceof MigrationRefused) return err;
    throw err;
  }
  throw new Error(`expected planMigration(${JSON.stringify(argv)}) to refuse, but it did not`);
}

function expectRefusal(argv: string[], code: RefusalCode, env = {}): MigrationRefused {
  const err = refusal(argv, env);
  expect(err.code, `argv ${JSON.stringify(argv)}`).toBe(code);
  return err;
}

describe("up", () => {
  it("needs no permission and no arguments", () => {
    expect(planMigration(["up"], {}, DB)).toEqual({ action: "up" });
  });

  it("ignores a trailing count rather than silently doing something else", () => {
    expect(planMigration(["up", "3"], {}, DB)).toEqual({ action: "up" });
  });
});

describe("down refuses without an explicit count", () => {
  it("REFUSES a bare `down` - the incident this exists for", () => {
    const err = expectRefusal(["down"], "DOWN_WITHOUT_COUNT", ALLOW_DOWN);
    expect(err.message).toContain("no count");
    // The message has to say what to type instead, and name the safe verb for
    // the thing the operator might actually have wanted.
    expect(err.message).toContain("migrate:down 1");
    expect(err.message).toContain("reset --confirm");
  });

  it("REFUSES an empty count", () => {
    expectRefusal(["down", ""], "DOWN_WITHOUT_COUNT", ALLOW_DOWN);
  });

  it.each([
    ["all", "all"],
    ["zero", "0"],
    ["negative", "-1"],
    ["Infinity", "Infinity"],
    ["fractional", "1.5"],
    ["not a number", "one"],
    ["leading plus", "+2"],
    ["hex", "0x2"],
    ["whitespace", " 2"],
  ])("REFUSES a %s count", (_label, value) => {
    const err = expectRefusal(["down", value], "DOWN_BAD_COUNT", ALLOW_DOWN);
    expect(err.message).toContain("positive whole");
  });

  it("REFUSES without ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION, even with a valid count", () => {
    const err = expectRefusal(["down", "1"], "DOWN_NOT_ALLOWED");
    expect(err.message).toContain("ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1");
  });

  it("REFUSES when the flag is set to anything other than exactly 1", () => {
    for (const value of ["true", "yes", "0", "", "TRUE"]) {
      expect(refusal(["down", "1"], { ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION: value }).code).toBe(
        "DOWN_NOT_ALLOWED",
      );
    }
  });

  it("checks the COUNT before the permission, so a malformed command says so", () => {
    // A bare `down` with permission granted is still a usage error, and the
    // useful message is the one about the count.
    expect(refusal(["down"], ALLOW_DOWN).code).toBe("DOWN_WITHOUT_COUNT");
    expect(refusal(["down"], {}).code).toBe("DOWN_WITHOUT_COUNT");
  });

  it("ALLOWS an explicit count with permission", () => {
    expect(planMigration(["down", "1"], ALLOW_DOWN, DB)).toEqual({ action: "down", count: 1 });
    expect(planMigration(["down", "10"], ALLOW_DOWN, DB)).toEqual({ action: "down", count: 10 });
  });

  it("does NOT accept the reset permission as permission to step down", () => {
    expect(refusal(["down", "1"], ALLOW_RESET).code).toBe("DOWN_NOT_ALLOWED");
  });
});

describe("reset refuses unless it is unmistakably intended", () => {
  it("REFUSES without --confirm", () => {
    const err = expectRefusal(["reset"], "RESET_WITHOUT_CONFIRM", ALLOW_RESET);
    expect(err.message).toContain("EVERY migration");
    // The message names the database, so the operator does not have to go and
    // look up what they are about to destroy.
    expect(err.message).toContain(`--confirm ${DB}`);
  });

  it("REFUSES --confirm with no name", () => {
    expectRefusal(["reset", "--confirm"], "RESET_WITHOUT_CONFIRM", ALLOW_RESET);
    expectRefusal(["reset", "--confirm", ""], "RESET_WITHOUT_CONFIRM", ALLOW_RESET);
  });

  it("REFUSES a name that is not the connected database", () => {
    // The case this prevents: a reset command pasted from another terminal,
    // landing on the wrong database.
    const err = refusal(["reset", "--confirm", "orchard_test"], ALLOW_RESET, "orchard");
    expect(err.code).toBe("RESET_NAME_MISMATCH");
    expect(err.message).toContain("orchard_test");
    expect(err.message).toContain("orchard");
  });

  it("REFUSES a name differing only in case", () => {
    expect(refusal(["reset", "--confirm", "ORCHARD"], ALLOW_RESET, "orchard").code).toBe(
      "RESET_NAME_MISMATCH",
    );
  });

  it("REFUSES the confirm flag in the wrong position", () => {
    expectRefusal(["reset", DB, "--confirm"], "RESET_WITHOUT_CONFIRM", ALLOW_RESET);
    expectRefusal(["reset", "-c", DB], "RESET_WITHOUT_CONFIRM", ALLOW_RESET);
  });

  it("REFUSES without ORCHARD_ALLOW_FULL_RESET, even when fully confirmed", () => {
    const err = expectRefusal(["reset", "--confirm", DB], "RESET_NOT_ALLOWED");
    expect(err.message).toContain("ORCHARD_ALLOW_FULL_RESET=1");
  });

  it("does NOT accept the down permission as permission to reset", () => {
    // Permission to step back one migration is not permission to destroy the
    // whole evidence store.
    const err = refusal(["reset", "--confirm", DB], ALLOW_DOWN);
    expect(err.code).toBe("RESET_NOT_ALLOWED");
  });

  it("checks confirmation BEFORE permission, so the message is actionable", () => {
    expect(refusal(["reset"], {}).code).toBe("RESET_WITHOUT_CONFIRM");
  });

  it("ALLOWS a fully confirmed, permitted reset", () => {
    expect(planMigration(["reset", "--confirm", DB], ALLOW_RESET, DB)).toEqual({
      action: "reset",
    });
  });
});

describe("a standalone `--` is ignored (CI #76)", () => {
  it("accepts `reset -- --confirm <db>`, which is what pnpm actually forwards", () => {
    // pnpm passes `--` to the script literally, so the natural command line
    // arrives with it still in place. Refusing that is a trap, not a guard.
    expect(planMigration(["reset", "--", "--confirm", DB], ALLOW_RESET, DB)).toEqual({
      action: "reset",
    });
  });

  it("accepts `down -- 1`", () => {
    expect(planMigration(["down", "--", "1"], ALLOW_DOWN, DB)).toEqual({
      action: "down",
      count: 1,
    });
  });

  it("accepts a leading `--` before the verb", () => {
    expect(planMigration(["--", "up"], {}, DB)).toEqual({ action: "up" });
  });

  it("still enforces every refusal with the separator present", () => {
    // Tolerating `--` must not become a way around the checks.
    expect(refusal(["down", "--"], ALLOW_DOWN).code).toBe("DOWN_WITHOUT_COUNT");
    expect(refusal(["down", "--", "all"], ALLOW_DOWN).code).toBe("DOWN_BAD_COUNT");
    expect(refusal(["down", "--", "1"], {}).code).toBe("DOWN_NOT_ALLOWED");
    expect(refusal(["reset", "--"], ALLOW_RESET).code).toBe("RESET_WITHOUT_CONFIRM");
    expect(refusal(["reset", "--", "--confirm", "wrong"], ALLOW_RESET, DB).code).toBe(
      "RESET_NAME_MISMATCH",
    );
    expect(refusal(["reset", "--", "--confirm", DB], {}).code).toBe("RESET_NOT_ALLOWED");
  });

  it("removes only ONE separator, so a doubled one still fails", () => {
    // Two separators is a genuinely malformed command, and guessing at the
    // intent behind a destructive operation is the wrong instinct.
    expect(refusal(["reset", "--", "--", "--confirm", DB], ALLOW_RESET).code).toBe(
      "RESET_WITHOUT_CONFIRM",
    );
  });

  it("does not treat `--confirm` itself as a separator", () => {
    expect(refusal(["reset", "--confirm"], ALLOW_RESET).code).toBe("RESET_WITHOUT_CONFIRM");
  });
});

describe("unknown commands", () => {
  it.each([[[]], [["sideways"]], [["DOWN"]], [["--help"]], [["up2"]], [[""]]])(
    "REFUSES %j with usage",
    (argv) => {
      const err = refusal(argv as string[], { ...ALLOW_DOWN, ...ALLOW_RESET });
      expect(err.code).toBe("USAGE");
      expect(err.message).toBe(USAGE);
    },
  );

  it("documents that down needs a count and reset needs its own flag", () => {
    expect(USAGE).toContain("down <count>");
    expect(USAGE).toContain("count is REQUIRED");
    expect(USAGE).toContain("reset --confirm <databaseName>");
    expect(USAGE).toContain("ORCHARD_ALLOW_FULL_RESET=1");
  });
});

describe("databaseNameOf", () => {
  it("reads the database name out of a connection string", () => {
    expect(databaseNameOf("postgres://u:p@localhost:5432/orchard")).toBe("orchard");
    expect(databaseNameOf("postgresql://u:p@127.0.0.1:5432/orchard_test")).toBe("orchard_test");
  });

  it("handles a connection string with query parameters", () => {
    expect(databaseNameOf("postgres://u:p@h:5432/orchard?sslmode=require")).toBe("orchard");
  });

  it("returns an empty name for an unparseable string, which cannot match a confirmation", () => {
    // An empty name can never equal a typed database name, so a malformed
    // DATABASE_URL fails the reset confirmation rather than bypassing it.
    expect(databaseNameOf("not a url")).toBe("");
    expect(refusal(["reset", "--confirm", "anything"], ALLOW_RESET, "").code).toBe(
      "RESET_NAME_MISMATCH",
    );
  });

  it("never leaks the password from the connection string", () => {
    expect(databaseNameOf("postgres://u:hunter2@localhost:5432/orchard")).not.toContain("hunter2");
  });
});
