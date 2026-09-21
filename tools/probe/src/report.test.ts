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
    overlapMatrix: [{ underlyingTicker: "EXA", platformIds: ["bstock", "ondo"] }],
    ratioAnomalies: [],
    staleness: [
      {
        binanceChainId: "56",
        tokenContractAddress: "0xabc",
        tokenPriceUpdatedAt: "2026-09-21T00:00:00.000Z",
        ageSeconds: 0,
      },
    ],
    referencePriceAnalysis: {
      vsTokenPriceBps: { sampleSize: 2, min: "0", max: "1", medianAbs: "0.5" },
      vsImpliedPricePerShareBps: { sampleSize: 2, min: "0", max: "1", medianAbs: "0.5" },
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
});
