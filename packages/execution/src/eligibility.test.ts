import { describe, expect, it } from "vitest";
import {
  applyEligibility,
  defaultPolicy,
  evaluateEligibility,
  reasonForProviderCode,
  DEFAULT_ALLOWED_ASSET_TYPES,
  DEFAULT_MAX_QUOTE_AGE_SECONDS,
  USDT_BSC,
} from "./eligibility.js";
import { REJECTION_REASON_CODES, type CandidateRoute } from "./types.js";

const CHAIN = "56";

function candidate(overrides: Partial<CandidateRoute> = {}): CandidateRoute {
  return {
    id: "cand-1",
    intentId: "intent-1",
    representationId: `${CHAIN}:0xaaa`,
    platformId: "ondo",
    underlyingTicker: "NVDA",
    tokenSymbol: "NVDAon",
    tokenContractAddress: "0xaaa",
    binanceChainId: CHAIN,
    assetType: 1,
    assetTypeLabel: "Stock",
    tokenToShareRatio: "1",
    quoteProvider: "BINANCE_WEB3",
    quoteId: "q1",
    inputAmount: "100000000000000000000",
    inputAmountDecimal: "100",
    expectedOutputTokenAmount: "1000000000000000000",
    toTokenDecimals: "18",
    normalizedExpectedShares: "1",
    effectivePricePerShare: "100",
    priceImpactBps: "4",
    quoteTimestamp: "2026-10-02T12:00:00.000Z",
    quoteAgeSeconds: 2,
    eligibility: "ELIGIBLE",
    rejectionReasons: [],
    ...overrides,
  };
}

/**
 * Drops the quote-result keys entirely. exactOptionalPropertyTypes forbids
 * passing them as explicit undefined, and "absent" is what a failed quote
 * actually looks like.
 */
function withoutQuote(c: CandidateRoute): CandidateRoute {
  const out: CandidateRoute = { ...c };
  delete out.expectedOutputTokenAmount;
  delete out.normalizedExpectedShares;
  delete out.effectivePricePerShare;
  return out;
}

const input = { targetChainId: CHAIN, policy: defaultPolicy() };

describe("defaultPolicy (DEC-005, DEC-036)", () => {
  it("defaults to Stock and ETF only, never Pre-IPO", () => {
    expect(defaultPolicy().allowedAssetTypes).toEqual([1, 3]);
    expect(DEFAULT_ALLOWED_ASSET_TYPES).toEqual([1, 3]);
    expect(defaultPolicy().allowedAssetTypes).not.toContain(2);
  });

  it("defaults maxQuoteAgeSeconds to 20 per DEC-036", () => {
    expect(defaultPolicy().maxQuoteAgeSeconds).toBe(20);
    expect(DEFAULT_MAX_QUOTE_AGE_SECONDS).toBe(20);
  });

  it("spends USDT on BSC at 18 decimals", () => {
    expect(defaultPolicy().spendAsset).toEqual(USDT_BSC);
    expect(USDT_BSC.decimals).toBe(18);
  });

  it("is overridable, so nothing is hardcoded in a decision path", () => {
    const p = defaultPolicy({
      allowedAssetTypes: [3],
      maxQuoteAgeSeconds: 5,
      maxPriceImpactBps: "10",
    });
    expect(p.allowedAssetTypes).toEqual([3]);
    expect(p.maxQuoteAgeSeconds).toBe(5);
    expect(p.maxPriceImpactBps).toBe("10");
  });
});

describe("reasonForProviderCode", () => {
  it("maps 40367 to NON_TRADING_SESSION and carries the code", () => {
    const r = reasonForProviderCode("40367");
    expect(r.code).toBe("NON_TRADING_SESSION");
    expect(r.providerCode).toBe("40367");
  });

  it("maps 40374 to UNSUPPORTED_TOKEN and carries the code", () => {
    const r = reasonForProviderCode("40374");
    expect(r.code).toBe("UNSUPPORTED_TOKEN");
    expect(r.providerCode).toBe("40374");
  });

  it("falls through to QUOTE_ERROR carrying any other code verbatim", () => {
    for (const code of ["40001", "50000", "49999", "40401"]) {
      const r = reasonForProviderCode(code);
      expect(r.code).toBe("QUOTE_ERROR");
      expect(r.providerCode).toBe(code);
    }
  });
});

describe("evaluateEligibility: every reason code", () => {
  it("ELIGIBLE candidate has no reasons", () => {
    expect(evaluateEligibility(candidate(), input)).toEqual([]);
    expect(applyEligibility(candidate(), input).eligibility).toBe("ELIGIBLE");
  });

  it("NULL_IDENTITY when assetType is null (the 3 excluded tokens, DEC-020)", () => {
    const reasons = evaluateEligibility(candidate({ assetType: null }), input);
    expect(reasons.map((r) => r.code)).toContain("NULL_IDENTITY");
  });

  it("ASSET_TYPE_EXCLUDED for Pre-IPO under the default policy", () => {
    const reasons = evaluateEligibility(candidate({ assetType: 2 }), input);
    expect(reasons.map((r) => r.code)).toContain("ASSET_TYPE_EXCLUDED");
    expect(reasons.find((r) => r.code === "ASSET_TYPE_EXCLUDED")?.detail).toMatch(/Pre-IPO/);
  });

  it("allows an ETF and labels it as an ETF, never as a stock", () => {
    const etf = candidate({ assetType: 3, assetTypeLabel: "ETF" });
    expect(evaluateEligibility(etf, input)).toEqual([]);
    expect(etf.assetTypeLabel).toBe("ETF");
  });

  it("WRONG_CHAIN for a representation on another chain", () => {
    const reasons = evaluateEligibility(candidate({ binanceChainId: "1" }), input);
    expect(reasons.map((r) => r.code)).toContain("WRONG_CHAIN");
  });

  it("INVALID_RATIO for an unusable ratio", () => {
    for (const ratio of ["0", "", "-1", "abc"]) {
      const reasons = evaluateEligibility(candidate({ tokenToShareRatio: ratio }), input);
      expect(reasons.map((r) => r.code)).toContain("INVALID_RATIO");
    }
  });

  it("QUOTE_STALE past the policy age, and not at the boundary", () => {
    expect(
      evaluateEligibility(candidate({ quoteAgeSeconds: 21 }), input).map((r) => r.code),
    ).toContain("QUOTE_STALE");
    expect(
      evaluateEligibility(candidate({ quoteAgeSeconds: 20 }), input).map((r) => r.code),
    ).not.toContain("QUOTE_STALE");
  });

  it("PRICE_IMPACT_EXCEEDS_MAX above the policy, and not a favourable negative impact", () => {
    expect(
      evaluateEligibility(candidate({ priceImpactBps: "301" }), input).map((r) => r.code),
    ).toContain("PRICE_IMPACT_EXCEEDS_MAX");
    expect(
      evaluateEligibility(candidate({ priceImpactBps: "300" }), input).map((r) => r.code),
    ).not.toContain("PRICE_IMPACT_EXCEEDS_MAX");
    expect(
      evaluateEligibility(candidate({ priceImpactBps: "-500" }), input).map((r) => r.code),
    ).not.toContain("PRICE_IMPACT_EXCEEDS_MAX");
  });

  it("UNSUPPORTED_TOKEN when there is no quote and the provider gave no reason", () => {
    const noQuote = withoutQuote(candidate());
    const reasons = evaluateEligibility(noQuote, input);
    expect(reasons.map((r) => r.code)).toContain("UNSUPPORTED_TOKEN");
  });

  it("carries a provider QUOTE_ERROR through with its code, without double-reporting", () => {
    const failed = withoutQuote(candidate({ rejectionReasons: [reasonForProviderCode("40001")] }));
    const reasons = evaluateEligibility(failed, input);
    expect(reasons.filter((r) => r.code === "QUOTE_ERROR")).toHaveLength(1);
    expect(reasons.find((r) => r.code === "QUOTE_ERROR")?.providerCode).toBe("40001");
    // No generic UNSUPPORTED_TOKEN on top of a specific provider explanation.
    expect(reasons.map((r) => r.code)).not.toContain("UNSUPPORTED_TOKEN");
  });

  it("carries 40367 NON_TRADING_SESSION through as the only explanation", () => {
    const closed = withoutQuote(candidate({ rejectionReasons: [reasonForProviderCode("40367")] }));
    const codes = evaluateEligibility(closed, input).map((r) => r.code);
    expect(codes).toEqual(["NON_TRADING_SESSION"]);
  });

  it("carries 40374 UNSUPPORTED_TOKEN through exactly once", () => {
    const thin = withoutQuote(candidate({ rejectionReasons: [reasonForProviderCode("40374")] }));
    const reasons = evaluateEligibility(thin, input);
    expect(reasons.filter((r) => r.code === "UNSUPPORTED_TOKEN")).toHaveLength(1);
    expect(reasons[0]?.providerCode).toBe("40374");
  });

  it("reports EVERY failing reason, not just the first", () => {
    const bad = candidate({
      assetType: 2,
      binanceChainId: "1",
      tokenToShareRatio: "0",
      quoteAgeSeconds: 99,
      priceImpactBps: "9999",
    });
    const codes = evaluateEligibility(bad, input).map((r) => r.code);
    expect(codes).toContain("ASSET_TYPE_EXCLUDED");
    expect(codes).toContain("WRONG_CHAIN");
    expect(codes).toContain("INVALID_RATIO");
    expect(codes).toContain("QUOTE_STALE");
    expect(codes).toContain("PRICE_IMPACT_EXCEEDS_MAX");
  });

  it("every declared reason code is reachable by some test above", () => {
    // Guards against a code being declared and never produced.
    const produced = new Set<string>();
    produced.add("QUOTE_ERROR");
    produced.add("NON_TRADING_SESSION");
    produced.add("UNSUPPORTED_TOKEN");
    for (const c of evaluateEligibility(
      candidate({
        assetType: null,
        binanceChainId: "1",
        tokenToShareRatio: "0",
        quoteAgeSeconds: 99,
        priceImpactBps: "9999",
      }),
      input,
    )) {
      produced.add(c.code);
    }
    for (const c of evaluateEligibility(candidate({ assetType: 2 }), input)) produced.add(c.code);
    expect([...produced].sort()).toEqual([...REJECTION_REASON_CODES].sort());
  });
});

describe("applyEligibility", () => {
  it("never mutates its input", () => {
    const original = candidate({ assetType: 2 });
    const snapshot = JSON.parse(JSON.stringify(original)) as CandidateRoute;
    applyEligibility(original, input);
    expect(original).toEqual(snapshot);
  });

  it("marks REJECTED and attaches the reasons", () => {
    const out = applyEligibility(candidate({ binanceChainId: "1" }), input);
    expect(out.eligibility).toBe("REJECTED");
    expect(out.rejectionReasons.map((r) => r.code)).toContain("WRONG_CHAIN");
  });
});
