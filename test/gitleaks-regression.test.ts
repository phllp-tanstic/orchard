import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Regression test for DEC-013 Spec Amendment A2: .gitleaks.toml's allowlist
 * used to exempt any file under test/fixtures/(SYNTHETIC_|DOC_EXAMPLE_)* by
 * path, which would have silently swallowed a real secret dropped into a
 * fixture file. The path allowlist is gone; only the one literal fixture
 * value (SYNTHETIC_TEST_SECRET_0123456789, packages/binance's HMAC test
 * vector secret) is exempted, by exact value. This runs the pinned gitleaks
 * binary for real, in throwaway temp directories, against our actual
 * .gitleaks.toml - a change to the config that silently reopened the hole
 * this closed would fail here, not just be caught by re-reading the toml.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const GITLEAKS_CONFIG = join(REPO_ROOT, ".gitleaks.toml");
const REQUIRED_VERSION = "8.30.1";
const FAKE_SECRET = "fake_leaked_secret_ABCDEFGH12345678";

function requireGitleaks(): void {
  let version: string;
  try {
    version = execFileSync("gitleaks", ["version"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      `gitleaks ${REQUIRED_VERSION} is required to run this regression test but is not on PATH. ` +
        `Install it (see .husky/pre-commit) and re-run.`,
    );
  }
  if (version !== REQUIRED_VERSION) {
    throw new Error(`gitleaks ${REQUIRED_VERSION} is required, found '${version}'.`);
  }
}

interface Leak {
  RuleID: string;
}

interface ScanResult {
  leaksFound: boolean;
  ruleIds: string[];
}

function runGitleaks(args: string[]): ScanResult {
  const reportPath = join(mkdtempSync(join(tmpdir(), "gitleaks-report-")), "report.json");
  try {
    execFileSync(
      "gitleaks",
      [
        ...args,
        "-c",
        GITLEAKS_CONFIG,
        "--no-banner",
        "--exit-code",
        "1",
        "-f",
        "json",
        "-r",
        reportPath,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { leaksFound: false, ruleIds: [] };
  } catch (err) {
    const e = err as { status?: number };
    if (e.status !== 1) throw err;
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Leak[];
    return { leaksFound: report.length > 0, ruleIds: report.map((l) => l.RuleID) };
  } finally {
    rmSync(reportPath, { force: true });
  }
}

function scanDir(dir: string): ScanResult {
  return runGitleaks(["dir", dir]);
}

function scanRepoHistory(): ScanResult {
  return runGitleaks(["git", REPO_ROOT]);
}

let workDir: string;

beforeAll(() => {
  requireGitleaks();
});

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("gitleaks regression (DEC-013 A2: exact-value allowlist, no path allowlist)", () => {
  it("flags a fake secret committed under src/", () => {
    workDir = mkdtempSync(join(tmpdir(), "gitleaks-src-"));
    mkdirSync(join(workDir, "src"), { recursive: true });
    writeFileSync(
      join(workDir, "src", "config.ts"),
      `export const BINANCE_WEB3_API_SECRET = "${FAKE_SECRET}";\n`,
    );

    const result = scanDir(workDir);
    expect(result.leaksFound).toBe(true);
    expect(result.ruleIds).toContain("binance-web3-api-secret");
  });

  it("flags the same fake secret even inside a SYNTHETIC_-prefixed fixture (no path allowlist)", () => {
    workDir = mkdtempSync(join(tmpdir(), "gitleaks-fixture-"));
    mkdirSync(join(workDir, "test", "fixtures"), { recursive: true });
    writeFileSync(
      join(workDir, "test", "fixtures", "SYNTHETIC_leaked.json"),
      JSON.stringify({ note: `BINANCE_WEB3_API_SECRET=${FAKE_SECRET}` }),
    );

    const result = scanDir(workDir);
    expect(result.leaksFound).toBe(true);
    expect(result.ruleIds).toContain("binance-web3-api-secret");
  });

  it("does not flag the one allowlisted literal fixture value (SYNTHETIC_TEST_SECRET_0123456789)", () => {
    workDir = mkdtempSync(join(tmpdir(), "gitleaks-allowlisted-"));
    mkdirSync(join(workDir, "test", "fixtures"), { recursive: true });
    writeFileSync(
      join(workDir, "test", "fixtures", "SYNTHETIC_signer_vectors.json"),
      JSON.stringify({ secret: "SYNTHETIC_TEST_SECRET_0123456789" }),
    );

    const result = scanDir(workDir);
    expect(result.leaksFound).toBe(false);
  });

  it("flags a fake DATABASE_URL with an embedded password", () => {
    workDir = mkdtempSync(join(tmpdir(), "gitleaks-dburl-"));
    writeFileSync(
      join(workDir, ".env.leaked"),
      // Built from parts (never a contiguous literal in this source file) so
      // this test file itself doesn't trip the very rule it's testing.
      [
        "DATABASE_URL=postgres://orchard_migrator:",
        "not_a_real_password_123",
        "@localhost:5432/orchard\n",
      ].join(""),
    );

    const result = scanDir(workDir);
    expect(result.leaksFound).toBe(true);
    expect(result.ruleIds).toContain("postgres-connection-string-password");
  });

  it("finds no leaks scanning this repository's own committed history", () => {
    const result = scanRepoHistory();
    expect(result.leaksFound).toBe(false);
  });
});
