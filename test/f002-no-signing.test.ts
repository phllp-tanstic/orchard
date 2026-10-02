import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
    else if (/\.ts$/.test(full)) out.push(full);
  }
  return out;
}

const FEATURE_DIRS = [
  join(REPO_ROOT, "packages", "execution"),
  join(REPO_ROOT, "tools", "route-probe"),
];

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

describe("F002: the execution feature cannot sign, swap, submit or broadcast", () => {
  const files = FEATURE_DIRS.flatMap(listFiles);

  it("scans a non-empty set of files (guards against a vacuous pass)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN)("never references %s (%s)", (pattern, label) => {
    const offenders = files.filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders, `${label} must not appear in the F002 feature`).toEqual([]);
  });

  it("only ever calls the read-only endpoints it needs", () => {
    const endpoints = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/\/api\/v1\/dex\/[a-z0-9/-]+/g)) {
        endpoints.add(m[0]);
      }
    }
    // Exactly the three read-only endpoints F002 needs: the token universe,
    // the per-share benchmark, and the quote. Anything else - a swap, an order
    // submission, a broadcast - would show up here.
    expect([...endpoints].sort()).toEqual([
      "/api/v1/dex/aggregator/quote",
      "/api/v1/dex/market/rwa/price",
      "/api/v1/dex/market/rwa/tokens",
    ]);
  });
});
