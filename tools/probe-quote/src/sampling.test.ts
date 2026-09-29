import { describe, expect, it } from "vitest";
import { groupByUnderlyingTicker, type TokenRepresentation } from "@orchard/rwa";
import { buildSampleSet, seededRandom, seededShuffle, usdToSmallestUnit } from "./sampling.js";

function rep(platformId: string, underlyingTicker: string, address: string): TokenRepresentation {
  return {
    binanceChainId: "56",
    tokenContractAddress: address,
    platformId,
    underlyingTicker,
    underlyingName: `${underlyingTicker} Inc`,
    assetType: 1,
    tokenToShareRatio: "1",
    tokenPrice: "100",
    referencePrice: "100",
    marketStatus: "regular",
    impliedPricePerShare: undefined,
    ratioAnomalyReason: undefined,
  };
}

/** 3 tickers on both platforms, plus 25 ondo-only and 25 bstock-only. */
function universe(): TokenRepresentation[] {
  const out: TokenRepresentation[] = [];
  for (const t of ["AAA", "BBB", "CCC"]) {
    out.push(rep("ondo", t, `0xondo${t}`));
    out.push(rep("bstock", t, `0xbst${t}`));
  }
  for (let i = 0; i < 25; i += 1) out.push(rep("ondo", `O${i}`, `0xo${i}`));
  for (let i = 0; i < 25; i += 1) out.push(rep("bstock", `B${i}`, `0xb${i}`));
  return out;
}

describe("seededRandom / seededShuffle", () => {
  it("is deterministic for a given seed", () => {
    const a = Array.from({ length: 8 }, seededRandom("seed-1"));
    const b = Array.from({ length: 8 }, seededRandom("seed-1"));
    expect(a).toEqual(b);
  });

  it("differs between seeds", () => {
    const a = Array.from({ length: 8 }, seededRandom("seed-1"));
    const b = Array.from({ length: 8 }, seededRandom("seed-2"));
    expect(a).not.toEqual(b);
  });

  it("shuffles without mutating the input and keeps every element", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = seededShuffle(input, seededRandom("s"));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(input);
  });
});

describe("buildSampleSet", () => {
  it("includes every representation of every multi-representation ticker", () => {
    const sample = buildSampleSet(groupByUnderlyingTicker(universe()), { seed: "s" });
    expect(sample.multiRepresentationTickers).toEqual(["AAA", "BBB", "CCC"]);
    expect(sample.multiRepresentation).toHaveLength(6);
    const platforms = new Set(sample.multiRepresentation.map((r) => r.platformId));
    expect([...platforms].sort()).toEqual(["bstock", "ondo"]);
  });

  it("draws the requested number of single-representation tickers per platform", () => {
    const sample = buildSampleSet(groupByUnderlyingTicker(universe()), {
      seed: "s",
      singleRepPerPlatform: 10,
    });
    expect(sample.singleRepresentation).toHaveLength(20);
    const byPlatform = new Map<string, number>();
    for (const r of sample.singleRepresentation) {
      byPlatform.set(r.platformId, (byPlatform.get(r.platformId) ?? 0) + 1);
    }
    expect(byPlatform.get("ondo")).toBe(10);
    expect(byPlatform.get("bstock")).toBe(10);
    expect(sample.shortfalls).toEqual([]);
  });

  it("never draws a multi-representation ticker into the single-representation sample", () => {
    const sample = buildSampleSet(groupByUnderlyingTicker(universe()), { seed: "s" });
    const multiTickers = new Set(sample.multiRepresentationTickers);
    for (const r of sample.singleRepresentation) {
      expect(multiTickers.has(r.underlyingTicker)).toBe(false);
    }
  });

  it("produces the identical sample for the same seed and a different one for another seed", () => {
    const keys = (seed: string): string[] =>
      buildSampleSet(groupByUnderlyingTicker(universe()), { seed }).all.map(
        (r) => r.tokenContractAddress,
      );
    expect(keys("seed-1")).toEqual(keys("seed-1"));
    expect(keys("seed-1")).not.toEqual(keys("seed-2"));
  });

  it("is insensitive to the order the provider returned tokens in", () => {
    const forward = buildSampleSet(groupByUnderlyingTicker(universe()), { seed: "s" }).all.map(
      (r) => r.tokenContractAddress,
    );
    const reversed = buildSampleSet(groupByUnderlyingTicker([...universe()].reverse()), {
      seed: "s",
    }).all.map((r) => r.tokenContractAddress);
    expect(reversed).toEqual(forward);
  });

  it("records a shortfall instead of failing when a platform has too few single-rep tickers", () => {
    const thin = [rep("ondo", "AAA", "0xa"), rep("bstock", "BBB", "0xb")];
    const sample = buildSampleSet(groupByUnderlyingTicker(thin), {
      seed: "s",
      singleRepPerPlatform: 10,
    });
    expect(sample.singleRepresentation).toHaveLength(2);
    expect(sample.shortfalls).toEqual([
      { platformId: "bstock", requested: 10, available: 1 },
      { platformId: "ondo", requested: 10, available: 1 },
    ]);
  });
});

describe("usdToSmallestUnit", () => {
  it("scales exactly at 18 decimals with no float error", () => {
    expect(usdToSmallestUnit("10", 18)).toBe("10000000000000000000");
    expect(usdToSmallestUnit("100", 18)).toBe("100000000000000000000");
    expect(usdToSmallestUnit("1000", 18)).toBe("1000000000000000000000");
  });

  it("scales at 6 decimals too", () => {
    expect(usdToSmallestUnit("10", 6)).toBe("10000000");
    expect(usdToSmallestUnit("0.01", 6)).toBe("10000");
  });

  it("refuses to silently truncate a size that is not a whole number of smallest units", () => {
    expect(() => usdToSmallestUnit("0.001", 2)).toThrow(/not expressible in whole smallest units/);
  });

  it("rejects nonsense decimals", () => {
    expect(() => usdToSmallestUnit("10", -1)).toThrow(/non-negative integer/);
    expect(() => usdToSmallestUnit("10", 1.5)).toThrow(/non-negative integer/);
  });
});
