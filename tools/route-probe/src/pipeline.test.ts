import { describe, expect, it, vi } from "vitest";
import { defaultPolicy, type QuoteResult, type RepresentationInput } from "@orchard/execution";
import { comparePlatforms, multiRepresentationTickersOf, runRouteProbe } from "./pipeline.js";
import { renderMarkdown } from "./report.js";

const CHAIN = "56";
const NOW = new Date("2026-10-02T12:00:05.000Z");

function rep(
  ticker: string,
  platformId: string,
  address: string,
  overrides: Partial<RepresentationInput> = {},
): RepresentationInput {
  return {
    platformId,
    underlyingTicker: ticker,
    tokenSymbol: `${ticker}${platformId === "ondo" ? "on" : "B"}`,
    tokenContractAddress: address,
    binanceChainId: CHAIN,
    assetType: 1,
    underlyingName: `${ticker} Inc`,
    tokenToShareRatio: "1",
    decimals: "18",
    perSharePrice: "100",
    ...overrides,
  };
}

function okQuote(toTokenAmount: string, overrides: Record<string, unknown> = {}): QuoteResult {
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
    quotedAt: new Date("2026-10-02T12:00:03.000Z"),
  };
}

function baseRequest(tickers?: string[]) {
  return {
    ...(tickers !== undefined ? { tickers } : {}),
    spendAmountDecimal: "100",
    policy: defaultPolicy(),
    targetChainId: CHAIN,
    probeWalletAddress: "0x000000000000000000000000000000000000dEaD",
    gitSha: "sha",
    probeRunId: "run-1",
  };
}

describe("multiRepresentationTickersOf", () => {
  it("returns only tickers with more than one representation, sorted", () => {
    const reps = [
      rep("NVDA", "ondo", "0xa"),
      rep("NVDA", "bstock", "0xb"),
      rep("AMD", "ondo", "0xc"),
      rep("ZZZ", "ondo", "0xd"),
      rep("ZZZ", "bstock", "0xe"),
    ];
    expect(multiRepresentationTickersOf(reps)).toEqual(["NVDA", "ZZZ"]);
  });

  it("counts distinct representations, not duplicate rows", () => {
    const reps = [rep("NVDA", "ondo", "0xa"), rep("NVDA", "ondo", "0xa")];
    expect(multiRepresentationTickersOf(reps)).toEqual([]);
  });
});

describe("runRouteProbe: single ticker", () => {
  it("quotes both representations and selects the one with more shares", async () => {
    const reps = [rep("NVDA", "ondo", "0xa"), rep("NVDA", "bstock", "0xb")];
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.resolve(reps),
      quote: (r) =>
        Promise.resolve(
          okQuote(r.platformId === "bstock" ? "1100000000000000000" : "1000000000000000000"),
        ),
      now: () => NOW,
    });

    expect(report.mode).toBe("single");
    expect(report.status).toBe("COMPLETE");
    expect(report.results).toHaveLength(1);
    const result = report.results[0]!;
    expect(result.decision.outcome).toBe("SELECTED");
    const winner = result.candidates.find((c) => c.id === result.decision.selectedCandidateId);
    expect(winner?.platformId).toBe("bstock");
    expect(report.batchSummary).toBeUndefined();
  });

  it("only considers representations on the target chain", async () => {
    const reps = [
      rep("NVDA", "ondo", "0xa"),
      rep("NVDA", "bstock", "0xb", { binanceChainId: "1" }),
    ];
    const quote = vi.fn(() => Promise.resolve(okQuote("1000000000000000000")));
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.resolve(reps),
      quote,
      now: () => NOW,
    });
    expect(quote).toHaveBeenCalledTimes(1);
    expect(report.results[0]!.candidates).toHaveLength(1);
  });

  it("records INCOMPLETE with the reason when no route is eligible", async () => {
    const reps = [rep("NVDA", "ondo", "0xa")];
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.resolve(reps),
      quote: () => Promise.resolve({ quotedAt: NOW, providerCode: "40367" }),
      now: () => NOW,
    });
    expect(report.status).toBe("INCOMPLETE");
    expect(report.results[0]!.decision.outcome).toBe("NO_ELIGIBLE_ROUTE");
    expect(report.incompleteReasons.join(" ")).toMatch(/no eligible route for NVDA/);
  });

  it("reports an unknown ticker as a reason rather than crashing", async () => {
    const report = await runRouteProbe(baseRequest(["NOPE"]), {
      resolveAll: () => Promise.resolve([rep("NVDA", "ondo", "0xa")]),
      quote: () => Promise.resolve(okQuote("1")),
      now: () => NOW,
    });
    expect(report.status).toBe("INCOMPLETE");
    expect(report.incompleteReasons.join(" ")).toMatch(/NOPE has no representation/);
  });

  it("is FAILED when the representation universe cannot be resolved", async () => {
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.reject(new Error("network down")),
      quote: () => Promise.resolve(okQuote("1")),
      now: () => NOW,
    });
    expect(report.status).toBe("FAILED");
    expect(report.results).toEqual([]);
    expect(report.incompleteReasons[0]).toMatch(/failed to resolve representations/);
  });

  it("attaches the execution_request id when persistence is wired", async () => {
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.resolve([rep("NVDA", "ondo", "0xa")]),
      quote: () => Promise.resolve(okQuote("1000000000000000000")),
      persist: () => Promise.resolve("req-123"),
      now: () => NOW,
    });
    expect(report.results[0]!.executionRequestId).toBe("req-123");
  });

  it("records a persistence failure as a reason without losing the result", async () => {
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.resolve([rep("NVDA", "ondo", "0xa")]),
      quote: () => Promise.resolve(okQuote("1000000000000000000")),
      persist: () => Promise.reject(new Error("db gone")),
      now: () => NOW,
    });
    expect(report.results).toHaveLength(1);
    expect(report.status).toBe("INCOMPLETE");
    expect(report.incompleteReasons.join(" ")).toMatch(/failed to persist NVDA: db gone/);
  });
});

describe("runRouteProbe: batch mode", () => {
  const reps = [
    rep("AAA", "ondo", "0xa1"),
    rep("AAA", "bstock", "0xa2"),
    rep("BBB", "ondo", "0xb1"),
    rep("BBB", "bstock", "0xb2"),
    rep("SOLO", "ondo", "0xs1"),
  ];

  it("runs every multi-representation ticker and summarizes platform wins", async () => {
    const report = await runRouteProbe(baseRequest(), {
      resolveAll: () => Promise.resolve(reps),
      quote: (r) =>
        Promise.resolve(
          okQuote(
            // ondo wins AAA, bstock wins BBB.
            r.underlyingTicker === "AAA"
              ? r.platformId === "ondo"
                ? "1200000000000000000"
                : "1000000000000000000"
              : r.platformId === "bstock"
                ? "1300000000000000000"
                : "1000000000000000000",
          ),
        ),
      now: () => NOW,
    });

    expect(report.mode).toBe("batch");
    const b = report.batchSummary!;
    expect(b.tickersRequested).toBe(2); // SOLO is single-representation
    expect(b.tickersSelected).toBe(2);
    expect(b.winsByPlatform).toEqual({ ondo: 1, bstock: 1 });
    expect(b.tickersWithFewerThanTwoEligible).toBe(0);
    expect(b.executionModeCounts).toEqual({ SWAP: 4 });
    expect(b.vendorCounts).toEqual({ LiquidMesh: 4 });
  });

  it("reports the normalized-shares spread in bps between the platforms", async () => {
    const report = await runRouteProbe(baseRequest(), {
      resolveAll: () => Promise.resolve(reps.slice(0, 2)),
      quote: (r) =>
        Promise.resolve(
          okQuote(r.platformId === "ondo" ? "1010000000000000000" : "1000000000000000000"),
        ),
      now: () => NOW,
    });
    const c = report.batchSummary!.comparisons[0]!;
    expect(c.winnerPlatformId).toBe("ondo");
    // 1.01 vs 1.00 = +100 bps for the winner.
    expect(c.normalizedSharesSpreadBps).toBe("100.0");
  });

  it("reports per-share benchmark agreement between platforms rather than assuming it", async () => {
    const divergent = [
      rep("AAA", "ondo", "0xa1", { perSharePrice: "100" }),
      rep("AAA", "bstock", "0xa2", { perSharePrice: "110" }),
    ];
    const report = await runRouteProbe(baseRequest(), {
      resolveAll: () => Promise.resolve(divergent),
      quote: () => Promise.resolve(okQuote("1000000000000000000")),
      now: () => NOW,
    });
    const c = report.batchSummary!.comparisons[0]!;
    // Platforms are compared in alphabetical order, so this is bstock (110)
    // against ondo (100): (110 - 100) / 100 = +1000 bps. Surfaced, not hidden -
    // a disagreement this large would mean the two platforms do not share a
    // per-share unit and their normalized shares are not comparable.
    expect(c.perShareBenchmarkAgreementBps).toBe("1000.0");
  });

  it("counts tickers with fewer than 2 eligible candidates", async () => {
    const report = await runRouteProbe(baseRequest(), {
      resolveAll: () => Promise.resolve(reps.slice(0, 2)),
      quote: (r) =>
        r.platformId === "ondo"
          ? Promise.resolve(okQuote("1000000000000000000"))
          : Promise.resolve({ quotedAt: NOW, providerCode: "40367" }),
      now: () => NOW,
    });
    const b = report.batchSummary!;
    expect(b.tickersWithFewerThanTwoEligible).toBe(1);
    expect(b.rejectionCodeCounts["NON_TRADING_SESSION"]).toBe(1);
    expect(b.comparisons[0]!.fewerThanTwoEligible).toBe(true);
  });

  it("counts every rejection reason across candidates", async () => {
    const mixed = [rep("AAA", "ondo", "0xa1"), rep("AAA", "bstock", "0xa2", { assetType: 2 })];
    const report = await runRouteProbe(baseRequest(), {
      resolveAll: () => Promise.resolve(mixed),
      quote: () => Promise.resolve(okQuote("1000000000000000000")),
      now: () => NOW,
    });
    expect(report.batchSummary!.rejectionCodeCounts["ASSET_TYPE_EXCLUDED"]).toBe(1);
  });
});

describe("comparePlatforms", () => {
  it("omits the spread when only one platform had an eligible candidate", async () => {
    const report = await runRouteProbe(baseRequest(["AAA"]), {
      resolveAll: () => Promise.resolve([rep("AAA", "ondo", "0xa1"), rep("AAA", "bstock", "0xa2")]),
      quote: (r) =>
        r.platformId === "ondo"
          ? Promise.resolve(okQuote("1000000000000000000"))
          : Promise.resolve({ quotedAt: NOW, providerCode: "40374" }),
      now: () => NOW,
    });
    const c = comparePlatforms(report.results[0]!);
    expect(c.normalizedSharesSpreadBps).toBeUndefined();
    expect(c.fewerThanTwoEligible).toBe(true);
    expect(c.eligibleByPlatform).toEqual({ ondo: 1 });
  });
});

describe("renderMarkdown", () => {
  it("renders only what the JSON holds, including the policy and the winner", async () => {
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.resolve([rep("NVDA", "ondo", "0xa"), rep("NVDA", "bstock", "0xb")]),
      quote: (r) =>
        Promise.resolve(
          okQuote(r.platformId === "bstock" ? "1100000000000000000" : "1000000000000000000"),
        ),
      now: () => NOW,
    });
    const md = renderMarkdown(report);
    expect(md).toContain("# Route Probe Report");
    expect(md).toContain("- Probe run: `run-1`");
    expect(md).toContain("- Status: **COMPLETE**");
    expect(md).toContain("Ranking algorithm: `f002-rank-1.0.0`");
    expect(md).toContain("Max quote age: 20s (DEC-036)");
    expect(md).toContain("DEC-005: Stock and ETF");
    expect(md).toContain("`0x000000000000000000000000000000000000dEaD`");
    expect(md).toContain("### NVDA - spend 100 USDT");
    expect(md).toContain("- Outcome: **SELECTED**");
    expect(md).toContain("[#1] bstock NVDAB");
    expect(md).toContain("[#2] ondo NVDAon");
    // The per-token fields are explicitly called out as NOT the benchmark.
    expect(md).toContain("are per-token and are NOT used here");
  });

  it("says plainly when there is no winner and lists every reason", async () => {
    const report = await runRouteProbe(baseRequest(["NVDA"]), {
      resolveAll: () => Promise.resolve([rep("NVDA", "ondo", "0xa")]),
      quote: () => Promise.resolve({ quotedAt: NOW, providerCode: "40367" }),
      now: () => NOW,
    });
    const md = renderMarkdown(report);
    expect(md).toContain("- Outcome: **NO_ELIGIBLE_ROUTE**");
    expect(md).toContain("Winner: none");
    expect(md).toContain("[REJECTED] ondo NVDAon");
    expect(md).toContain("NON_TRADING_SESSION(40367)");
  });

  it("renders the batch comparison table", async () => {
    const report = await runRouteProbe(baseRequest(), {
      resolveAll: () => Promise.resolve([rep("AAA", "ondo", "0xa1"), rep("AAA", "bstock", "0xa2")]),
      quote: (r) =>
        Promise.resolve(
          okQuote(r.platformId === "ondo" ? "1010000000000000000" : "1000000000000000000"),
        ),
      now: () => NOW,
    });
    const md = renderMarkdown(report);
    expect(md).toContain("## Batch summary");
    expect(md).toContain("### Per-ticker platform comparison");
    expect(md).toContain("| Ticker | Winner | Eligible per platform |");
    expect(md).toContain("| AAA | ondo |");
    expect(md).toContain("Wins by platform (this run only)");
  });
});
