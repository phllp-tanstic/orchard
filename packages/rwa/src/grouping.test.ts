import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { tokensDataSchema } from "./schemas.js";
import {
  groupByUnderlyingTicker,
  multiRepresentationTickers,
  toRepresentation,
} from "./grouping.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "..", "test", "fixtures", "DOC_EXAMPLE_tokens.json");

function loadTokens() {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  return tokensDataSchema.parse(raw);
}

describe("groupByUnderlyingTicker", () => {
  it("groups strictly by the explicit underlyingTicker field", () => {
    const tokens = loadTokens();
    const reps = tokens.map(toRepresentation);
    const groups = groupByUnderlyingTicker(reps);

    expect(groups.size).toBe(1);
    const exa = groups.get("EXA");
    expect(exa?.representations).toHaveLength(2);
  });

  it("flags a multi-representation ticker", () => {
    const tokens = loadTokens();
    const reps = tokens.map(toRepresentation);
    const groups = groupByUnderlyingTicker(reps);
    expect(multiRepresentationTickers(groups)).toEqual(["EXA"]);
  });

  it("does not flag a conflict when underlyingName and assetType agree across representations", () => {
    const tokens = loadTokens();
    const reps = tokens.map(toRepresentation);
    const groups = groupByUnderlyingTicker(reps);
    expect(groups.get("EXA")?.conflicts).toEqual([]);
  });

  it("flags a conflicting underlyingName within the same ticker", () => {
    const tokens = loadTokens();
    const reps = tokens.map(toRepresentation);
    reps[1]!.underlyingName = "Example Corp (renamed)";
    const groups = groupByUnderlyingTicker(reps);
    const conflicts = groups.get("EXA")?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.field).toBe("underlyingName");
    expect(conflicts[0]!.values).toHaveLength(2);
  });

  it("flags a conflicting assetType within the same ticker", () => {
    const tokens = loadTokens();
    const reps = tokens.map(toRepresentation);
    reps[1]!.assetType = 3;
    const groups = groupByUnderlyingTicker(reps);
    const conflicts = groups.get("EXA")?.conflicts ?? [];
    expect(conflicts.map((c) => c.field)).toContain("assetType");
  });

  it("never derives grouping from tokenSymbol - two different tickers stay separate even if symbols look related", () => {
    const tokens = loadTokens();
    const reps = tokens.map(toRepresentation);
    reps[1]!.underlyingTicker = "EXB"; // deliberately different ticker, same-looking symbols
    const groups = groupByUnderlyingTicker(reps);
    expect(groups.size).toBe(2);
    expect(multiRepresentationTickers(groups)).toEqual([]);
  });

  it("computes impliedPricePerShare per representation via decimal.js", () => {
    const tokens = loadTokens();
    const reps = tokens.map(toRepresentation);
    // token 1: tokenPrice 100.00, ratio 1 -> implied 100
    expect(reps[0]!.impliedPricePerShare?.toString()).toBe("100");
    // token 2: tokenPrice 10.00, ratio 0.1 -> implied 100
    expect(reps[1]!.impliedPricePerShare?.toString()).toBe("100");
  });
});
