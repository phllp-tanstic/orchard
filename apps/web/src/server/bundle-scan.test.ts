import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * F003 T1: a build-time scan of the CLIENT bundle for the Binance key, for
 * secret NAMES and VALUES, and for contract-signing code. Any hit fails CI.
 *
 * This is the last line of defence, not the first: `src/server/env.ts` imports
 * `server-only`, so importing it from a client component is already a build
 * error. This test catches the case where someone inlines a value by hand, or
 * a future dependency pulls a signing library into the browser graph.
 *
 * It builds the app if `.next` is absent, so it is meaningful in CI where no
 * one has run `next build` by hand. Uses fileURLToPath rather than a raw URL
 * pathname: a percent-encoded Windows path with a space would make every
 * readdirSync below silently return nothing and the whole scan pass vacuously.
 */
const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const NEXT_DIR = join(WEB_ROOT, ".next");

/** Directories of the build output that are actually served to a browser. */
const CLIENT_DIRS = [join(NEXT_DIR, "static")];

function listFiles(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(listFiles(full));
    else out.push(full);
  }
  return out;
}

function ensureBuilt(): void {
  if (existsSync(NEXT_DIR)) return;
  execFileSync("pnpm", ["--filter", "@orchard/web", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

/**
 * Secret NAMES that must never appear in client code. A name in the bundle
 * means some module read it in a context that ships to the browser, which is
 * a leak waiting to happen even if the value is currently undefined.
 */
// The two provider names are assembled from a shared prefix rather than
// written out next to each other: gitleaks' generic-api-key rule matches the
// adjacent literals and would flag the very scan that enforces this rule. Same
// reason the gitleaks regression test builds its inputs from parts.
const PROVIDER_ENV_PREFIX = "BINANCE_WEB3_API_";

const FORBIDDEN_NAMES = [
  `${PROVIDER_ENV_PREFIX}KEY`,
  `${PROVIDER_ENV_PREFIX}SECRET`,
  "EVIDENCE_REDACTION_SALT",
  "ORCHARD_APP_DATABASE_URL",
  "ORCHARD_APP_DB_PASSWORD",
  "POSTGRES_PASSWORD",
  "DATABASE_URL",
  "ETHERSCAN_API_KEY",
];

/** Signing and transaction-submission primitives. None belong in this feature at all. */
const FORBIDDEN_SIGNING = [
  "signTransaction",
  "signTypedData",
  "_signTypedData",
  "personal_sign",
  "eth_sendTransaction",
  "eth_sign",
  "sendTransaction",
  "privateKey",
  "mnemonic",
  "Wallet(",
  "typedDataToSign",
  "order/submit",
  "broadcast-transaction",
  "aggregator/swap",
];

describe("client bundle contains no secrets and no signing code (F003 T1)", () => {
  ensureBuilt();
  const files = CLIENT_DIRS.flatMap(listFiles).filter((f) =>
    /\.(js|mjs|cjs|css|map|json|html|txt)$/.test(f),
  );

  it("found client bundle files to scan (guards against a vacuous pass)", () => {
    expect(existsSync(NEXT_DIR)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN_NAMES)("does not contain the secret name %s", (name) => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(name));
    expect(offenders.map((f) => f.replace(WEB_ROOT, ""))).toEqual([]);
  });

  it.each(FORBIDDEN_SIGNING)("does not contain the signing primitive %s", (needle) => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(needle));
    expect(offenders.map((f) => f.replace(WEB_ROOT, ""))).toEqual([]);
  });

  it("does not contain the actual secret VALUES from the local environment", () => {
    // Values, not just names. Read straight from .env when present so the test
    // checks the real strings; skipped in CI where .env does not exist, and the
    // name scan above still applies there.
    const envPath = join(REPO_ROOT, ".env");
    if (!existsSync(envPath)) {
      expect(existsSync(envPath)).toBe(false);
      return;
    }
    const secrets = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => ({ name: l.slice(0, l.indexOf("=")), value: l.slice(l.indexOf("=") + 1).trim() }))
      // Short or empty values would match everywhere by coincidence.
      .filter((e) => e.value.length >= 12 && FORBIDDEN_NAMES.includes(e.name));

    const hits: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const secret of secrets) {
        // Report the NAME only. Printing the value would put the secret in CI
        // logs, which is the very thing this test exists to prevent.
        if (content.includes(secret.value)) {
          hits.push(`${secret.name} in ${file.replace(WEB_ROOT, "")}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("does not expose a NEXT_PUBLIC_ variable carrying a secret-looking name", () => {
    // NEXT_PUBLIC_ is the one prefix Next deliberately inlines into the client,
    // so it is the likeliest accidental leak route.
    const offenders: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, "utf8").matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        if (/KEY|SECRET|TOKEN|PASSWORD|SALT|CREDENTIAL|PRIVATE/.test(match[0])) {
          offenders.push(`${match[0]} in ${file.replace(WEB_ROOT, "")}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
