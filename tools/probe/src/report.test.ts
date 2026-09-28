import { describe, expect, it } from "vitest";
import { renderMarkdown, type RwaUniverseReport } from "./report.js";

function baseReport(overrides: Partial<RwaUniverseReport> = {}): RwaUniverseReport {
  return {
    probeRunId: "run-1",
    gitSha: "abc123",
    generatedAt: "2026-09-21T00:00:00.000Z",
    totalRepresentations: 2,
    uniqueUnderlyings: 1,
    multiRepresentationUnderlyings: ["EXA"],
    platformCounts: { ondo: 1, bstock: 1 },
    reconciliation: [
      {
        platformId: "ondo",
        targetChainId: "56",
        reportedTokenCount: 1,
        actualTokenCount: 1,
        ok: true,
      },
    ],
    assetTypeBreakdown: { Stock: 2 },
    marketStatusBreakdown: { regular: 2 },
    undocumentedMarketStatuses: {},
    overlapMatrix: [{ underlyingTicker: "EXA", platformIds: ["bstock", "ondo"] }],
    ratioAnomalies: [],
    invalidRatios: [],
    incompleteTokenRecords: [],
    staleness: [
      {
        binanceChainId: "56",
        tokenContractAddress: "0xabc",
        tokenPriceUpdatedAt: "2026-09-21T00:00:00.000Z",
        ageSeconds: 0,
      },
    ],
    referencePriceAnalysis: {
      vsTokenPriceBps: {
        sampleSize: 2,
        min: "0",
        max: "1",
        medianAbs: "0.5",
        minToken: { tokenContractAddress: "0xabc", platformId: "ondo", underlyingTicker: "AAPL" },
        maxToken: { tokenContractAddress: "0xdef", platformId: "bstock", underlyingTicker: "TSLA" },
      },
      vsImpliedPricePerShareBps: {
        sampleSize: 2,
        min: "0",
        max: "1",
        medianAbs: "0.5",
        minToken: { tokenContractAddress: "0xabc", platformId: "ondo", underlyingTicker: "AAPL" },
        maxToken: { tokenContractAddress: "0xdef", platformId: "bstock", underlyingTicker: "TSLA" },
      },
      verdict: "derived-from-tokenPrice",
    },
    unknownFields: {},
    status: "COMPLETE",
    incompleteReasons: [],
    ...overrides,
  };
}

describe("renderMarkdown", () => {
  it("renders the report status and generatedAt", () => {
    const md = renderMarkdown(baseReport());
    expect(md).toContain("Status: **COMPLETE**");
    expect(md).toContain("run-1");
  });

  it("renders incomplete reasons only when status is not COMPLETE", () => {
    const completeMd = renderMarkdown(baseReport());
    expect(completeMd).not.toContain("Incomplete reasons");

    const incompleteMd = renderMarkdown(
      baseReport({ status: "INCOMPLETE", incompleteReasons: ["reconciliation mismatch for X"] }),
    );
    expect(incompleteMd).toContain("Incomplete reasons");
    expect(incompleteMd).toContain("reconciliation mismatch for X");
  });

  it("never renders a report as complete when status is FAILED", () => {
    const md = renderMarkdown(baseReport({ status: "FAILED", incompleteReasons: ["boom"] }));
    expect(md).toContain("Status: **FAILED**");
    expect(md).not.toContain("Status: **COMPLETE**");
  });

  it("names the token at each end of both bps ranges, alongside the range itself", () => {
    const md = renderMarkdown(baseReport());
    expect(md).toContain("- vs tokenPrice (bps): n=2, medianAbs=0.5, range=[0, 1]");
    expect(md).toContain("  - min 0: ondo 0xabc (AAPL)");
    expect(md).toContain("  - max 1: bstock 0xdef (TSLA)");
    expect(md).toContain("- vs impliedPricePerShare (bps): n=2, medianAbs=0.5, range=[0, 1]");
  });

  it("renders n/a for both extremes when a bps summary has no samples", () => {
    const md = renderMarkdown(
      baseReport({
        referencePriceAnalysis: {
          vsTokenPriceBps: {
            sampleSize: 0,
            min: undefined,
            max: undefined,
            medianAbs: undefined,
            minToken: undefined,
            maxToken: undefined,
          },
          vsImpliedPricePerShareBps: {
            sampleSize: 0,
            min: undefined,
            max: undefined,
            medianAbs: undefined,
            minToken: undefined,
            maxToken: undefined,
          },
          verdict: "inconclusive",
        },
      }),
    );
    expect(md).toContain("- vs tokenPrice (bps): n=0, medianAbs=n/a, range=[n/a, n/a]");
    expect(md).toContain("  - min n/a: n/a");
    expect(md).toContain("  - max n/a: n/a");
  });

  it("renders marketStatus values outside the documented list with counts (DEC-025)", () => {
    const md = renderMarkdown(baseReport({ undocumentedMarketStatuses: { halted: 3 } }));
    expect(md).toContain("## marketStatus values outside the documented list");
    expect(md).toContain("- halted: 3");
    expect(md).toContain("Status: **COMPLETE**");
  });

  it('renders "none" when every marketStatus is documented or null', () => {
    const md = renderMarkdown(baseReport());
    const section = md.split("## marketStatus values outside the documented list")[1]!;
    expect(section.trimStart().startsWith("- none")).toBe(true);
  });
});
