import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * F002 hard rule: no signing, /swap, /order/submit, broadcast or wallet.
 *
 * This asserts it at the source level across the whole execution feature, so a
 * future edit that reaches for one of those endpoints fails here rather than in
 * a live run. Uses fileURLToPath, never a raw URL pathname, so a Windows user
 * directory with a space does not silently make the scan vacuous.
 */
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const IGNORE = /^(node_modules|\.git|dist|coverage|\.turbo)$/;

/**
 * Strips block and line comments. The guard must judge CODE, not prose: a
 * comment that says "this never calls /order/submit" is a promise being kept,
 * not a violation, and scanning raw text would flag it.
 */
const BLOCK_COMMENT = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
const LINE_COMMENT = new RegExp("//[^\\n]*", "g");

function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, " ");
}

function listFiles(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORE.test(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(listFiles(full));
    // .tsx too, or the entire UI layer - the part a browser actually runs -
    // would be outside the scan.
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const FEATURE_DIRS = [
  join(REPO_ROOT, "packages", "execution"),
  join(REPO_ROOT, "tools", "route-probe"),
  // F003 extends this guard to the web app: the browser-facing surface is
  // exactly where a signing path would be most damaging and least noticed.
  join(REPO_ROOT, "apps", "web"),
];

/**
 * The client-bundle scanner is exempt from the forbidden-string scan, by file
 * name, with a reason: it ENUMERATES these strings in order to assert they are
 * absent from the built bundle. Scanning it would make this guard flag the
 * very code that enforces the same rule.
 *
 * Three files, and no more: the scanner, the CLI that runs it after a build,
 * and its tests (which plant each primitive as a negative control). The
 * allowlist is the one way this guard can be weakened, so its contents are
 * themselves asserted below - a fourth entry has to be argued for in a diff,
 * not slipped in.
 */
const ALLOWLISTED_FILES = new Set(["bundle-scan.ts", "bundle-scan-cli.ts", "bundle-scan.test.ts"]);

// node's own basename, not a hand-rolled split: a regex that forgets the
// Windows separator silently matches nothing and the allowlist quietly fails
// open, which is exactly what happened the first time this was written.
function fileName(path: string): string {
  return basename(path);
}

const FORBIDDEN: [RegExp, string][] = [
  [/aggregator\/swap/, "GET /swap"],
  [/order\/submit/, "POST /order/submit"],
  [/broadcast-transaction/, "POST /broadcast-transaction"],
  [/buildSwapRequest/, "the /swap request builder"],
  [/typedDataToSign/, "EIP-712 typed data (signing input)"],
  [
    /privateKey|PRIVATE_KEY|signTransaction|signTypedData|personal_sign|eth_sendTransaction/,
    "a signing primitive",
  ],
];

describe("F002/F003: the execution feature and the web app cannot sign, swap, submit or broadcast", () => {
  const allFiles = FEATURE_DIRS.flatMap(listFiles);
  const files = allFiles.filter((f) => !ALLOWLISTED_FILES.has(fileName(f)));

  it("scans a non-empty set of files (guards against a vacuous pass)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("covers the web app, not only the engine", () => {
    expect(files.some((f) => f.includes(join("apps", "web")))).toBe(true);
  });

  it("exempts ONLY the client-bundle scanner, and every exempt file exists", () => {
    // The allowlist is this guard's single weak point. Pinning its contents
    // means growing it is a visible decision; checking the files exist means a
    // rename cannot leave a dead entry quietly broadening nothing.
    expect([...ALLOWLISTED_FILES].sort()).toEqual([
      "bundle-scan-cli.ts",
      "bundle-scan.test.ts",
      "bundle-scan.ts",
    ]);
    for (const name of ALLOWLISTED_FILES) {
      expect(
        allFiles.some((f) => fileName(f) === name),
        `allowlisted file ${name} no longer exists - remove the entry`,
      ).toBe(true);
    }
  });

  it.each(FORBIDDEN)("never references %s (%s)", (pattern, label) => {
    const offenders = files.filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders, `${label} must not appear in the F002/F003 feature`).toEqual([]);
  });

  it("the web app declares no wallet or web3 dependency", () => {
    // A signing path usually arrives as a dependency long before it arrives as
    // a call, so the manifest is the cheaper place to catch it.
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, "apps", "web", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    const wallety = names.filter((n) =>
      /ethers|web3|viem|wagmi|walletconnect|@solana|bip39|hdkey|keccak|secp256k1/i.test(n),
    );
    expect(wallety).toEqual([]);
  });

  it("only ever calls the read-only endpoints it needs", () => {
    const endpoints = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/\/api\/v1\/dex\/[a-z0-9/-]+/g)) {
        endpoints.add(m[0]);
      }
    }
    // Exactly the read-only endpoints these features need: the token universe,
    // the per-share benchmark, the quote, and (F003 health/capabilities) the
    // platforms list. Anything else - a swap, an order submission, a broadcast
    // - would show up here.
    expect([...endpoints].sort()).toEqual([
      "/api/v1/dex/aggregator/quote",
      "/api/v1/dex/market/rwa/platforms",
      "/api/v1/dex/market/rwa/price",
      "/api/v1/dex/market/rwa/tokens",
    ]);
  });
});
