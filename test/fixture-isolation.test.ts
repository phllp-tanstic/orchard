import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces AGENTS.md's fixture-isolation rule: test fixtures live only in
 * test/fixtures/ (per package or per tool), are prefixed DOC_EXAMPLE_ or
 * SYNTHETIC_, and are never imported from `src`.
 */
const REPO_ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function listFiles(dir: string, ignore: RegExp): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (ignore.test(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out = out.concat(listFiles(full, ignore));
    } else {
      out.push(full);
    }
  }
  return out;
}

const IGNORE = /^(node_modules|\.git|dist|coverage|\.turbo)$/;

describe("fixture isolation", () => {
  it("no src/ file imports from a test/fixtures/ path", () => {
    const srcFiles = listFiles(join(REPO_ROOT, "packages"), IGNORE)
      .concat(listFiles(join(REPO_ROOT, "tools"), IGNORE))
      .filter((f) => /[\\/]src[\\/]/.test(f) && /\.(ts|tsx|js|mjs)$/.test(f));

    const offenders: string[] = [];
    for (const file of srcFiles) {
      const content = readFileSync(file, "utf8");
      if (/test\/fixtures/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every file under a test/fixtures/ directory is prefixed DOC_EXAMPLE_ or SYNTHETIC_", () => {
    const fixtureDirs = listFiles(REPO_ROOT, IGNORE).filter((f) =>
      /[\\/]test[\\/]fixtures[\\/]/.test(f),
    );

    const offenders = fixtureDirs.filter((f) => {
      const base = f.split(/[\\/]/).pop() ?? "";
      return !/^(DOC_EXAMPLE_|SYNTHETIC_)/.test(base);
    });
    expect(offenders).toEqual([]);
  });

  it("no fixture file is referenced from evidence/ or db/ (they must never be written there)", () => {
    const targets = listFiles(join(REPO_ROOT, "evidence"), IGNORE).concat(
      listFiles(join(REPO_ROOT, "db"), IGNORE),
    );
    const offenders: string[] = [];
    for (const file of targets) {
      if (file.endsWith(".gitignore")) continue;
      const content = readFileSync(file, "utf8");
      if (/test\/fixtures/.test(content) || /(DOC_EXAMPLE_|SYNTHETIC_)/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
