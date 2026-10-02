import { describe, expect, it } from "vitest";
import {
  ALGORITHM_VERSION,
  compareCandidates,
  decidingStep,
  rankCandidates,
  RANKING_STEPS,
} from "./ranking.js";
import type { CandidateRoute } from "./types.js";

function candidate(id: string, overrides: Partial<CandidateRoute> = {}): CandidateRoute {
  return {
    id,
    intentId: "intent-1",
    representationId: `56:0x${id}`,
    platformId: "ondo",
    underlyingTicker: "NVDA",
    tokenSymbol: "NVDAon",
    tokenContractAddress: `0x${id}`,
    binanceChainId: "56",
    assetType: 1,
    assetTypeLabel: "Stock",
    tokenToShareRatio: "1",
    quoteProvider: "BINANCE_WEB3",
    inputAmount: "100000000000000000000",
    inputAmountDecimal: "100",
    expectedOutputTokenAmount: "1000000000000000000",
    toTokenDecimals: "18",
    normalizedExpectedShares: "1",
    quoteAgeSeconds: 5,
    eligibility: "ELIGIBLE",
    rejectionReasons: [],
    ...overrides,
  };
}

/** Deterministic shuffles of a list, for order-invariance checks. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([items[i]!, ...p]);
  }
  return out;
}

describe("ALGORITHM_VERSION", () => {
  it("is a stable non-empty string recorded on every decision", () => {
    expect(ALGORITHM_VERSION).toBe("f002-rank-1.0.0");
  });

  it("declares the cascade in spec order", () => {
    expect(RANKING_STEPS).toEqual([
      "NORMALIZED_SHARES_DESC",
      "EXPLICIT_FEES_ASC",
      "QUOTE_FRESHNESS_ASC",
      "PRICE_IMPACT_ASC",
      "TOKEN_ADDRESS_LEXICOGRAPHIC",
    ]);
  });
});

describe("step 1: highest normalized shares wins", () => {
  it("orders by shares descending", () => {
    const a = candidate("aaa", { normalizedExpectedShares: "2" });
    const b = candidate("bbb", { normalizedExpectedShares: "1" });
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
    expect(compareCandidates(a, b).step).toBe("NORMALIZED_SHARES_DESC");
  });

  it("compares shares as exact decimals, not floats", () => {
    // These differ only in the 18th decimal place.
    const a = candidate("aaa", { normalizedExpectedShares: "1.000000000000000002" });
    const b = candidate("bbb", { normalizedExpectedShares: "1.000000000000000001" });
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("step 2: lower explicit fees", () => {
  it("prefers the lower tradeFee when both report it", () => {
    const a = candidate("aaa", { tradeFee: "0.01" });
    const b = candidate("bbb", { tradeFee: "0.02" });
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
    expect(compareCandidates(a, b).step).toBe("EXPLICIT_FEES_ASC");
  });

  it("falls to estimateGasFee when tradeFee ties", () => {
    const a = candidate("aaa", { tradeFee: "0.01", estimateGasFee: "100000" });
    const b = candidate("bbb", { tradeFee: "0.01", estimateGasFee: "200000" });
    expect(compareCandidates(a, b).step).toBe("EXPLICIT_FEES_ASC");
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
  });

  it("skips the fee step when only one side reports, rather than treating missing as zero", () => {
    // b discloses a fee, a does not. The step must not reward a for silence.
    const a = candidate("aaa", { tradeFee: null, quoteAgeSeconds: 9 });
    const b = candidate("bbb", { tradeFee: "0.02", quoteAgeSeconds: 1 });
    const cmp = compareCandidates(a, b);
    expect(cmp.step).toBe("QUOTE_FRESHNESS_ASC");
    expect(rankCandidates([a, b]).map((c) => c.id)).toEqual(["bbb", "aaa"]);
  });

  it("ignores a non-numeric fee string", () => {
    const a = candidate("aaa", { tradeFee: "n/a", quoteAgeSeconds: 1 });
    const b = candidate("bbb", { tradeFee: "0.02", quoteAgeSeconds: 9 });
    expect(compareCandidates(a, b).step).toBe("QUOTE_FRESHNESS_ASC");
  });
});

describe("step 3: fresher quote", () => {
  it("prefers the smaller age", () => {
    const a = candidate("aaa", { quoteAgeSeconds: 1 });
    const b = candidate("bbb", { quoteAgeSeconds: 10 });
    expect(compareCandidates(a, b).step).toBe("QUOTE_FRESHNESS_ASC");
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("step 4: lower price impact", () => {
  it("prefers the lower impact", () => {
    const a = candidate("aaa", { priceImpactBps: "1" });
    const b = candidate("bbb", { priceImpactBps: "50" });
    expect(compareCandidates(a, b).step).toBe("PRICE_IMPACT_ASC");
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("step 5: lexicographic address tie-break", () => {
  it("settles an otherwise exact tie by address", () => {
    const a = candidate("aaa", { tokenContractAddress: "0xaaa" });
    const b = candidate("bbb", { tokenContractAddress: "0xbbb" });
    expect(compareCandidates(a, b).step).toBe("TOKEN_ADDRESS_LEXICOGRAPHIC");
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
  });

  it("is insensitive to checksum casing", () => {
    const a = candidate("a1", { tokenContractAddress: "0xAAA" });
    const b = candidate("b1", { tokenContractAddress: "0xbbb" });
    expect(rankCandidates([b, a]).map((c) => c.id)).toEqual(["a1", "b1"]);
  });
});

describe("properties the spec requires", () => {
  const set = [
    candidate("aaa", { normalizedExpectedShares: "3", tokenContractAddress: "0xa" }),
    candidate("bbb", { normalizedExpectedShares: "3", tokenContractAddress: "0xb" }),
    candidate("ccc", {
      normalizedExpectedShares: "2",
      tradeFee: "0.01",
      tokenContractAddress: "0xc",
    }),
    candidate("ddd", {
      normalizedExpectedShares: "2",
      tradeFee: "0.02",
      tokenContractAddress: "0xd",
    }),
    candidate("eee", {
      normalizedExpectedShares: "1",
      quoteAgeSeconds: 1,
      tokenContractAddress: "0xe",
    }),
  ];

  it("is invariant to input order across every permutation", () => {
    const expected = rankCandidates(set).map((c) => c.id);
    const perms = permutations(set);
    expect(perms.length).toBe(120);
    for (const p of perms) {
      expect(rankCandidates(p).map((c) => c.id)).toEqual(expected);
    }
  });

  it("is deterministic: identical input gives identical output", () => {
    const first = rankCandidates(set).map((c) => c.id);
    for (let i = 0; i < 5; i += 1) {
      expect(rankCandidates(set).map((c) => c.id)).toEqual(first);
    }
  });

  it("never mutates the input array or its elements", () => {
    const snapshot = JSON.parse(JSON.stringify(set)) as CandidateRoute[];
    const order = set.map((c) => c.id);
    rankCandidates(set);
    expect(set.map((c) => c.id)).toEqual(order);
    expect(set).toEqual(snapshot);
  });

  it("is a strict total order: no two distinct candidates ever compare equal", () => {
    for (const a of set) {
      for (const b of set) {
        if (a.id === b.id) continue;
        const ab = compareCandidates(a, b).order;
        const ba = compareCandidates(b, a).order;
        expect(ab).not.toBe(0);
        expect(ab).toBe(-ba);
      }
    }
  });

  it("drops REJECTED candidates rather than ranking them last", () => {
    const rejected = candidate("zzz", {
      normalizedExpectedShares: "999",
      eligibility: "REJECTED",
      rejectionReasons: [{ code: "QUOTE_STALE" }],
    });
    const ranked = rankCandidates([...set, rejected]);
    expect(ranked.map((c) => c.id)).not.toContain("zzz");
    expect(ranked).toHaveLength(set.length);
  });

  it("returns an empty ranking when nothing is eligible", () => {
    const all = set.map((c) => ({ ...c, eligibility: "REJECTED" as const }));
    expect(rankCandidates(all)).toEqual([]);
  });
});

describe("decidingStep", () => {
  it("names the step that settled the winner against the runner-up", () => {
    const a = candidate("aaa", { normalizedExpectedShares: "2" });
    const b = candidate("bbb", { normalizedExpectedShares: "1" });
    expect(decidingStep(rankCandidates([a, b]))).toBe("NORMALIZED_SHARES_DESC");
  });

  it("is undefined when there is no runner-up", () => {
    expect(decidingStep([])).toBeUndefined();
    expect(decidingStep([candidate("aaa")])).toBeUndefined();
  });
});
