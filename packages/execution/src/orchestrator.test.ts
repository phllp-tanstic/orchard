import { describe, expect, it, vi } from "vitest";
import { defaultPolicy } from "./eligibility.js";
import { runBestExecution, type QuoteResult, type RunDeps } from "./orchestrator.js";
import { ALGORITHM_VERSION } from "./ranking.js";
import type { RepresentationInput } from "./types.js";

const CHAIN = "56";
const NOW = new Date("2026-10-02T12:00:10.000Z");

function rep(overrides: Partial<RepresentationInput> = {}): RepresentationInput {
  return {
    platformId: "ondo",
    underlyingTicker: "NVDA",
    tokenSymbol: "NVDAon",
    tokenContractAddress: "0xa",
    binanceChainId: CHAIN,
    assetType: 1,
    underlyingName: "NVIDIA",
    tokenToShareRatio: "1",
    decimals: "18",
    perSharePrice: "100",
    ...overrides,
  };
}

function okQuote(
  toTokenAmount: string,
  overrides: Partial<QuoteResult["route"]> = {},
): QuoteResult {
  return {
    route: {
      quoteId: "q1",
      toTokenAmount,
      toTokenDecimal: "18",
      executionMode: "SWAP",
      vendorName: "LiquidMesh",
      priceImpactPercent: "0.01",
      ...overrides,
    },
    quotedAt: new Date("2026-10-02T12:00:08.000Z"),
    providerCallId: "11111111-1111-1111-1111-111111111111",
  };
}

/** Deterministic ids so an assertion can name a candidate. */
function idFactory(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
}

function deps(
  reps: RepresentationInput[],
  quote: RunDeps["quote"],
  overrides: Partial<RunDeps> = {},
): RunDeps {
  return {
    resolveRepresentations: () => Promise.resolve(reps),
    quote,
    now: () => NOW,
    newId: idFactory(),
    ...overrides,
  };
}

const request = {
  underlyingTicker: "NVDA",
  spendAmountDecimal: "100",
  policy: defaultPolicy(),
  targetChainId: CHAIN,
};

describe("runBestExecution: happy path", () => {
  it("quotes every representation, normalizes and picks the most shares", async () => {
    const reps = [
      rep({ platformId: "ondo", tokenContractAddress: "0xa" }),
      rep({ platformId: "bstock", tokenSymbol: "NVDAB", tokenContractAddress: "0xb" }),
    ];
    const quote = vi.fn(
      async (r: RepresentationInput) =>
        r.platformId === "ondo"
          ? okQuote("1000000000000000000") // 1.0 shares
          : okQuote("1100000000000000000"), // 1.1 shares - should win
    );
    const result = await runBestExecution(request, deps(reps, quote));

    expect(quote).toHaveBeenCalledTimes(2);
    expect(result.candidates).toHaveLength(2);
    expect(result.ranked.map((c) => c.platformId)).toEqual(["bstock", "ondo"]);
    expect(result.decision.outcome).toBe("SELECTED");
    expect(result.decision.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(result.decision.reasonCodes).toEqual(["NORMALIZED_SHARES_DESC"]);
    const winner = result.candidates.find((c) => c.id === result.decision.selectedCandidateId);
    expect(winner?.platformId).toBe("bstock");
    expect(winner?.normalizedExpectedShares).toBe("1.1");
  });

  it("computes the spend in smallest units and passes it to the quote", async () => {
    // Declare both parameters so the mock's call tuple is typed.
    const quote = vi.fn(async (_r: RepresentationInput, _amount: string) =>
      okQuote("1000000000000000000"),
    );
    const result = await runBestExecution(request, deps([rep()], quote));
    expect(result.spendAmountSmallestUnit).toBe("100000000000000000000");
    expect(quote.mock.calls[0]?.[1]).toBe("100000000000000000000");
  });

  it("records each quote's own timestamp, so freshness is per quote", async () => {
    const reps = [rep({ tokenContractAddress: "0xa" }), rep({ tokenContractAddress: "0xb" })];
    const quote = vi.fn(async (r: RepresentationInput) => ({
      ...okQuote("1000000000000000000"),
      quotedAt:
        r.tokenContractAddress === "0xa"
          ? new Date("2026-10-02T12:00:09.000Z")
          : new Date("2026-10-02T12:00:01.000Z"),
    }));
    const result = await runBestExecution(request, deps(reps, quote));
    const byAddr = new Map(result.candidates.map((c) => [c.tokenContractAddress, c]));
    expect(byAddr.get("0xa")?.quoteAgeSeconds).toBe(1);
    expect(byAddr.get("0xb")?.quoteAgeSeconds).toBe(9);
  });

  it("carries assetType and its label onto every candidate", async () => {
    const reps = [rep({ assetType: 3 })];
    const result = await runBestExecution(
      request,
      deps(reps, async () => okQuote("1000000000000000000")),
    );
    expect(result.candidates[0]?.assetType).toBe(3);
    expect(result.candidates[0]?.assetTypeLabel).toBe("ETF");
  });

  it("computes the deviation from the per-share benchmark", async () => {
    // 1 share for 100 spend = 100/share, benchmark 100 => 0 bps.
    const result = await runBestExecution(
      request,
      deps([rep({ perSharePrice: "100" })], async () => okQuote("1000000000000000000")),
    );
    expect(result.candidates[0]?.effectivePricePerShare).toBe("100");
    expect(result.candidates[0]?.referenceDeviationBps).toBe("0");
  });

  it("links each candidate to the provider_call that produced its quote", async () => {
    const result = await runBestExecution(
      request,
      deps([rep()], async () => okQuote("1000000000000000000")),
    );
    expect(result.candidates[0]?.providerCallId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("quotes concurrently, bounded by the configured concurrency", async () => {
    const reps = Array.from({ length: 6 }, (_, i) => rep({ tokenContractAddress: `0x${i}` }));
    let inFlight = 0;
    let peak = 0;
    const quote = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return okQuote("1000000000000000000");
    });
    await runBestExecution(request, deps(reps, quote, { concurrency: 2 }));
    expect(quote).toHaveBeenCalledTimes(6);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });
});

describe("runBestExecution: fail-closed per candidate", () => {
  it("one failing candidate does not abort the run", async () => {
    const reps = [
      rep({ tokenContractAddress: "0xa" }),
      rep({ tokenContractAddress: "0xb", platformId: "bstock" }),
    ];
    const quote = vi.fn(async (r: RepresentationInput) =>
      r.tokenContractAddress === "0xa"
        ? ({ quotedAt: NOW, providerCode: "40374" } satisfies QuoteResult)
        : okQuote("1000000000000000000"),
    );
    const result = await runBestExecution(request, deps(reps, quote));

    expect(result.candidates).toHaveLength(2);
    expect(result.ranked).toHaveLength(1);
    expect(result.decision.outcome).toBe("SELECTED");
    const failed = result.candidates.find((c) => c.tokenContractAddress === "0xa");
    expect(failed?.eligibility).toBe("REJECTED");
    expect(failed?.rejectionReasons[0]?.code).toBe("UNSUPPORTED_TOKEN");
    expect(failed?.rejectionReasons[0]?.providerCode).toBe("40374");
  });

  it("a thrown quote becomes one rejected candidate, not a thrown run", async () => {
    const reps = [rep({ tokenContractAddress: "0xa" }), rep({ tokenContractAddress: "0xb" })];
    const quote = vi.fn(async (r: RepresentationInput) => {
      if (r.tokenContractAddress === "0xa") throw new Error("socket hang up");
      return okQuote("1000000000000000000");
    });
    const result = await runBestExecution(request, deps(reps, quote));
    const failed = result.candidates.find((c) => c.tokenContractAddress === "0xa");
    expect(failed?.rejectionReasons[0]?.code).toBe("QUOTE_ERROR");
    expect(failed?.rejectionReasons[0]?.detail).toMatch(/socket hang up/);
    expect(result.decision.outcome).toBe("SELECTED");
  });

  it("40367 is recorded as NON_TRADING_SESSION on that candidate only", async () => {
    const reps = [rep({ tokenContractAddress: "0xa" }), rep({ tokenContractAddress: "0xb" })];
    const quote = vi.fn(async (r: RepresentationInput) =>
      r.tokenContractAddress === "0xa"
        ? ({ quotedAt: NOW, providerCode: "40367" } satisfies QuoteResult)
        : okQuote("1000000000000000000"),
    );
    const result = await runBestExecution(request, deps(reps, quote));
    const closed = result.candidates.find((c) => c.tokenContractAddress === "0xa");
    expect(closed?.rejectionReasons.map((r) => r.code)).toEqual(["NON_TRADING_SESSION"]);
  });

  it("an invalid ratio rejects that candidate without throwing", async () => {
    const reps = [rep({ tokenToShareRatio: "0", tokenContractAddress: "0xa" })];
    const result = await runBestExecution(
      request,
      deps(reps, async () => okQuote("1000000000000000000")),
    );
    expect(result.candidates[0]?.rejectionReasons.map((r) => r.code)).toContain("INVALID_RATIO");
    expect(result.decision.outcome).toBe("NO_ELIGIBLE_ROUTE");
  });
});

describe("runBestExecution: NO_ELIGIBLE_ROUTE", () => {
  it("lists every rejection reason and selects nothing when all fail", async () => {
    const reps = [
      rep({ tokenContractAddress: "0xa" }),
      rep({ tokenContractAddress: "0xb", assetType: 2 }),
      rep({ tokenContractAddress: "0xc", binanceChainId: "1" }),
    ];
    const quote = vi.fn(async (r: RepresentationInput) =>
      r.tokenContractAddress === "0xa"
        ? ({ quotedAt: NOW, providerCode: "40367" } satisfies QuoteResult)
        : okQuote("1000000000000000000"),
    );
    const result = await runBestExecution(request, deps(reps, quote));

    expect(result.decision.outcome).toBe("NO_ELIGIBLE_ROUTE");
    expect(result.decision.selectedCandidateId).toBeNull();
    expect(result.decision.rankedCandidateIds).toEqual([]);
    expect(result.decision.reasonCodes).toEqual(
      ["ASSET_TYPE_EXCLUDED", "NON_TRADING_SESSION", "WRONG_CHAIN"].sort(),
    );
    // Still records the algorithm version, so the decision is explainable.
    expect(result.decision.algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it("never substitutes a fallback price when nothing is eligible", async () => {
    const reps = [rep()];
    const result = await runBestExecution(
      request,
      deps(reps, async () => ({ quotedAt: NOW, providerCode: "40367" }) satisfies QuoteResult),
    );
    expect(result.decision.selectedCandidateId).toBeNull();
    expect(result.candidates[0]?.effectivePricePerShare).toBeUndefined();
    expect(result.candidates[0]?.normalizedExpectedShares).toBeUndefined();
  });

  it("reports NO_REPRESENTATIONS when the ticker resolves to nothing", async () => {
    const result = await runBestExecution(
      request,
      deps([], async () => okQuote("1")),
    );
    expect(result.decision.outcome).toBe("NO_ELIGIBLE_ROUTE");
    expect(result.decision.reasonCodes).toEqual(["NO_REPRESENTATIONS"]);
    expect(result.candidates).toEqual([]);
  });

  it("marks a sole eligible candidate as such rather than naming a comparison step", async () => {
    const result = await runBestExecution(
      request,
      deps([rep()], async () => okQuote("1000000000000000000")),
    );
    expect(result.decision.reasonCodes).toEqual(["SOLE_ELIGIBLE_CANDIDATE"]);
  });
});

describe("runBestExecution: hard rules", () => {
  it("is read-only: the only provider interaction is the injected quote function", async () => {
    // The orchestrator has no other provider seam. A swap, order-submit or
    // broadcast call is impossible by construction, and this pins that the
    // dependency surface stays quote-only.
    const d = deps([rep()], async () => okQuote("1000000000000000000"));
    expect(Object.keys(d).sort()).toEqual(
      ["newId", "now", "quote", "resolveRepresentations"].sort(),
    );
    const result = await runBestExecution(request, d);
    expect(result.candidates[0]?.quoteProvider).toBe("BINANCE_WEB3");
  });

  it("treats executionMode and vendorName as opaque strings it records but never branches on", async () => {
    const reps = [rep({ tokenContractAddress: "0xa" }), rep({ tokenContractAddress: "0xb" })];
    const quote = vi.fn(async (r: RepresentationInput) =>
      okQuote("1000000000000000000", {
        executionMode: r.tokenContractAddress === "0xa" ? "RFQ" : "SOMETHING_NEW",
        vendorName: r.tokenContractAddress === "0xa" ? "MysteryVendor" : "LiquidMesh",
      }),
    );
    const result = await runBestExecution(request, deps(reps, quote));
    // Both remain eligible: an unknown mode or vendor is never a rejection.
    expect(result.ranked).toHaveLength(2);
    const modes = result.candidates.map((c) => c.executionMode).sort();
    expect(modes).toEqual(["RFQ", "SOMETHING_NEW"]);
  });

  it("is deterministic: the same inputs give the same decision", async () => {
    const reps = [
      rep({ tokenContractAddress: "0xa" }),
      rep({ tokenContractAddress: "0xb", platformId: "bstock" }),
    ];
    const run = () =>
      runBestExecution(
        request,
        deps(reps, async (r: RepresentationInput) =>
          okQuote(r.tokenContractAddress === "0xa" ? "1000000000000000000" : "1100000000000000000"),
        ),
      );
    const a = await run();
    const b = await run();
    expect(a.ranked.map((c) => c.tokenContractAddress)).toEqual(
      b.ranked.map((c) => c.tokenContractAddress),
    );
    expect(a.decision.reasonCodes).toEqual(b.decision.reasonCodes);
  });
});
