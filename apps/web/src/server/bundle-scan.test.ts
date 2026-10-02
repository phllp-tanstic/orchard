import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  FORBIDDEN_NAMES,
  FORBIDDEN_SIGNING,
  MIN_SECRET_VALUE_LENGTH,
  collectSecretValues,
  formatFindings,
  scanClientBundle,
} from "./bundle-scan";

/**
 * The client-bundle scan, tested two ways (F003 hardening item 4).
 *
 * NEGATIVE CONTROLS first: a scanner that has only ever run against a clean
 * tree has never been shown to detect anything. Each test plants exactly one
 * sentinel - a secret value, a secret name, a signing import - in a temp
 * directory and asserts it is found. If the scan silently stopped working,
 * these fail; the real-bundle test below would keep passing.
 *
 * Then the REAL bundle, built if absent, as the actual assertion about what
 * this app ships.
 */

const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const NEXT_DIR = join(WEB_ROOT, ".next");
const CLIENT_DIR = join(NEXT_DIR, "static");

// The provider variable names are built from a shared prefix rather than
// written out as a literal name followed by a colon and a value: gitleaks
// reads that shape as a real credential assignment and flags this file. Same
// reason the scanner itself assembles them, and the same reason the gitleaks
// regression test builds its inputs from parts. Widening the gitleaks
// allowlist to accommodate a test file would be the wrong trade.
const PROVIDER_PREFIX = "BINANCE_WEB3_API_";
const KEY_NAME = `${PROVIDER_PREFIX}KEY`;
const SECRET_NAME = `${PROVIDER_PREFIX}SECRET`;

/** A value that exists nowhere in the repo, so a hit can only be the plant. */
const SENTINEL_VALUE = "SYNTHETIC_SENTINEL_f003_do_not_ship_9d41c7";

let workDir: string | undefined;

function tempBundle(files: Record<string, string>): string {
  workDir = mkdtempSync(join(tmpdir(), "orchard-bundle-scan-"));
  const dir = join(workDir, "static");
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

afterEach(() => {
  if (workDir !== undefined) rmSync(workDir, { recursive: true, force: true });
  workDir = undefined;
});

describe("negative controls: the scan actually detects a planted leak", () => {
  it("DETECTS a planted secret VALUE", () => {
    const dir = tempBundle({
      "chunk.js": `const x="prefix${SENTINEL_VALUE}suffix";export default x;`,
    });
    const result = scanClientBundle({
      dirs: [dir],
      secretValues: [{ name: SECRET_NAME, value: SENTINEL_VALUE }],
    });
    const hit = result.findings.find((f) => f.kind === "SECRET_VALUE");
    expect(hit).toBeDefined();
    expect(hit?.detail).toBe(SECRET_NAME);
    expect(result.secretValuesChecked).toBe(1);
  });

  it("NEVER prints the secret value, only its name", () => {
    // A finding goes into a build log. Printing the value there is precisely
    // the leak this scanner exists to prevent.
    const dir = tempBundle({ "chunk.js": SENTINEL_VALUE });
    const result = scanClientBundle({
      dirs: [dir],
      secretValues: [{ name: "EVIDENCE_REDACTION_SALT", value: SENTINEL_VALUE }],
    });
    const printed = JSON.stringify(result.findings) + formatFindings(result);
    expect(printed).toContain("EVIDENCE_REDACTION_SALT");
    expect(printed).not.toContain(SENTINEL_VALUE);
  });

  it.each(FORBIDDEN_NAMES)("DETECTS the planted secret NAME %s", (name) => {
    const dir = tempBundle({ "chunk.js": `const v=process.env["${name}"];` });
    const findings = scanClientBundle({ dirs: [dir] }).findings;
    expect(findings.some((f) => f.kind === "SECRET_NAME" && f.detail === name)).toBe(true);
  });

  it.each(FORBIDDEN_SIGNING)("DETECTS the planted signing primitive %s", (needle) => {
    const dir = tempBundle({ "chunk.js": `import {x} from "lib";x.${needle};` });
    const findings = scanClientBundle({ dirs: [dir] }).findings;
    expect(findings.some((f) => f.kind === "SIGNING_PRIMITIVE" && f.detail === needle)).toBe(true);
  });

  it("DETECTS a planted signing IMPORT, as a dependency arriving in the graph", () => {
    // A signing path usually arrives as a library long before it arrives as a
    // call, and a bundler rewrites the import - so the detected trace is the
    // primitive the library exposes, which is what this asserts.
    const dir = tempBundle({
      "vendor.js": [
        'import{Wallet}from"ethers";',
        "const w=new Wallet(pk);",
        "await w.signTransaction(tx);",
        'await provider.send("eth_sendTransaction",[tx]);',
      ].join("\n"),
    });
    const kinds = scanClientBundle({ dirs: [dir] }).findings;
    expect(kinds.filter((f) => f.kind === "SIGNING_PRIMITIVE").map((f) => f.detail)).toEqual(
      expect.arrayContaining(["Wallet(", "signTransaction", "eth_sendTransaction"]),
    );
  });

  it("DETECTS a NEXT_PUBLIC_ variable with a credential-shaped name", () => {
    const dir = tempBundle({
      "chunk.js": 'const a=process.env.NEXT_PUBLIC_API_SECRET;const b="NEXT_PUBLIC_SITE_NAME";',
    });
    const findings = scanClientBundle({ dirs: [dir] }).findings;
    expect(findings.some((f) => f.detail === "NEXT_PUBLIC_API_SECRET")).toBe(true);
    // A harmless public variable is not a finding; otherwise the scan becomes
    // noise and gets switched off.
    expect(findings.some((f) => f.detail === "NEXT_PUBLIC_SITE_NAME")).toBe(false);
  });

  it("finds a leak in a NESTED directory, not just the top level", () => {
    const dir = tempBundle({ "chunks/app/deep/page.js": SENTINEL_VALUE });
    const result = scanClientBundle({
      dirs: [dir],
      secretValues: [{ name: "DATABASE_URL", value: SENTINEL_VALUE }],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toContain("deep");
  });

  it("scans source maps and CSS, which ship too", () => {
    const dir = tempBundle({
      "chunk.js.map": `{"sourcesContent":["${SENTINEL_VALUE}"]}`,
      "app.css": `/* ${SENTINEL_VALUE} */`,
    });
    const result = scanClientBundle({
      dirs: [dir],
      secretValues: [{ name: "POSTGRES_PASSWORD", value: SENTINEL_VALUE }],
    });
    expect(result.findings).toHaveLength(2);
  });

  it("reports NOTHING for a clean bundle", () => {
    const dir = tempBundle({
      "chunk.js": 'export const amount="100";export const ticker="NVDA";',
      "app.css": "body{margin:0}",
    });
    const result = scanClientBundle({
      dirs: [dir],
      secretValues: [{ name: "DATABASE_URL", value: SENTINEL_VALUE }],
    });
    expect(result.findings).toEqual([]);
    expect(result.filesScanned).toBe(2);
    expect(formatFindings(result)).toContain("no findings");
  });

  it("reports zero files for a missing directory, so the CLI can fail closed", () => {
    const result = scanClientBundle({ dirs: [join(tmpdir(), "orchard-does-not-exist-9d41c7")] });
    expect(result.filesScanned).toBe(0);
    expect(result.findings).toEqual([]);
  });
});

describe("collectSecretValues", () => {
  it("takes values from the PROCESS ENVIRONMENT", () => {
    // On a host there is no .env - the platform injects the environment - and
    // that is the build whose output is served to the public.
    const secrets = collectSecretValues({
      env: { [SECRET_NAME]: SENTINEL_VALUE, UNRELATED: "also-long-enough-value" },
    });
    expect(secrets).toEqual([{ name: SECRET_NAME, value: SENTINEL_VALUE }]);
  });

  it("takes values from the root .env file", () => {
    const secrets = collectSecretValues({
      envFileContents: `# comment\nEVIDENCE_REDACTION_SALT=${SENTINEL_VALUE}\nNOISE=x\n`,
    });
    expect(secrets).toEqual([{ name: "EVIDENCE_REDACTION_SALT", value: SENTINEL_VALUE }]);
  });

  it("MERGES both sources, because either alone misses a real case", () => {
    const secrets = collectSecretValues({
      env: { [KEY_NAME]: `env-${SENTINEL_VALUE}` },
      envFileContents: `${SECRET_NAME}=file-${SENTINEL_VALUE}\n`,
    });
    expect(secrets.map((s) => s.name).sort()).toEqual([KEY_NAME, SECRET_NAME]);
  });

  it("de-duplicates a value present in both sources", () => {
    const secrets = collectSecretValues({
      env: { DATABASE_URL: SENTINEL_VALUE },
      envFileContents: `DATABASE_URL=${SENTINEL_VALUE}\n`,
    });
    expect(secrets).toHaveLength(1);
  });

  it("strips surrounding quotes, as dotenv does", () => {
    const secrets = collectSecretValues({
      envFileContents: `DATABASE_URL="${SENTINEL_VALUE}"\n`,
    });
    expect(secrets[0]?.value).toBe(SENTINEL_VALUE);
  });

  it("ignores values too SHORT to be evidence of anything", () => {
    // A short string matches somewhere by coincidence, and a scanner that
    // cries wolf gets switched off.
    expect(collectSecretValues({ env: { DATABASE_URL: "short" } })).toEqual([]);
    expect(
      collectSecretValues({ env: { DATABASE_URL: "x".repeat(MIN_SECRET_VALUE_LENGTH) } }),
    ).toHaveLength(1);
  });

  it("ignores an empty or unset variable", () => {
    expect(
      collectSecretValues({ env: { DATABASE_URL: "", POSTGRES_PASSWORD: undefined } }),
    ).toEqual([]);
  });

  it("only collects the names it is responsible for", () => {
    expect(collectSecretValues({ env: { SOME_OTHER_THING: "a-long-enough-value-here" } })).toEqual(
      [],
    );
  });
});

function ensureBuilt(): void {
  if (existsSync(CLIENT_DIR)) return;
  execFileSync("pnpm", ["--filter", "@orchard/web", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

describe("the REAL client bundle contains no secrets and no signing code", () => {
  ensureBuilt();

  const envPath = join(REPO_ROOT, ".env");
  const result = scanClientBundle({
    dirs: [CLIENT_DIR],
    secretValues: collectSecretValues({
      env: process.env,
      ...(existsSync(envPath) ? { envFileContents: readFileSync(envPath, "utf8") } : {}),
    }),
    displayRoot: WEB_ROOT,
  });

  it("scanned real files (guards against a vacuous pass)", () => {
    expect(existsSync(CLIENT_DIR)).toBe(true);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it("has NO findings of any kind", () => {
    // formatFindings, not the raw array: the message names what was found and
    // where, and never prints a value.
    expect(formatFindings(result)).toContain("no findings");
    expect(result.findings).toEqual([]);
  });
});
