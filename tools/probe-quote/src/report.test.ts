import { describe, expect, it } from "vitest";
import { renderMarkdown, type QuoteFeasibilityReport } from "./report.js";

/**
 * The Markdown report is rendered FROM the JSON report only - never
 * independently computed (same discipline as F001-A). These tests pin that: a
 * number that is not in the JSON must not appear in the Markdown.
 */

type Observation = QuoteFeasibilityReport["ttlObservations"][number];

/** exactOptionalPropertyTypes forbids an explicit undefined, so omit the key. */
function omitReuseProviderCode(observation: Observation): Observation {
  const rest: Observation = { ...observation };
  delete rest.reuseProviderCode;
  return rest;
}

function report(overrides: Partial<QuoteFeasibilityReport> = {}): QuoteFeasibilityReport {
  return {
    probeRunId: "run-1",
    gitSha: "abc123",
    generatedAt: "2026-09-30T00:00:00.000Z",
    sampling: {
      seed: "test-seed",
      singleRepPerPlatform: 10,
      multiRepresentationTickerCount: 1,
      multiRepresentationTickers: ["AAA"],
      multiRepresentationCount: 2,
      singleRepresentationCount: 3,
      totalRepresentations: 5,
      shortfalls: [],
      universeRepresentations: 485,
      universeUnderlyings: 445,
    },
    probeConfig: {
      userWalletAddress: "0x000000000000000000000000000000000000dEaD",
      spendTokenAddress: "0xspendtoken",
      spendTokenDecimals: 18,
      spendTokenSymbolObserved: "USDT",
      spendTokenDecimalsConfirmedLive: true,
      spendSizesUsd: ["10", "100", "1000"],
      slippagePercent: "0.5",
    },
    results: [
      {
        platformId: "ondo",
        underlyingTicker: "AAA",
        binanceChainId: "56",
        tokenContractAddress: "0xondoaaa",
        tokenSymbol: "AAAon",
        sampleGroup: "multi",
        attempts: [
          {
            spendUsd: "10",
            amount: "10000000000000000000",
            quoted: true,
            routeCount: 1,
            executionModes: ["SWAP"],
            vendorNames: ["LiquidMesh"],
            best: {
              quoteId: "q1",
              vendorName: "LiquidMesh",
              executionMode: "SWAP",
              toTokenAmount: "30218580111383404",
              priceImpactPercent: "0.0",
              tradeFee: "0.02",
              estimateGasFee: "450000",
              approveTarget: "0xapprovetarget",
              isBestFlagged: true,
            },
            swap: {
              attempted: true,
              succeeded: true,
              executionMode: "SWAP",
              payload: "tx",
              txFields: ["data", "from", "to", "value"],
            },
            simulate: {
              leg: "swapTx",
              to: "0xrouter",
              returned: true,
              status: "SUCCESS",
              failReason: null,
              balanceChangeCount: 2,
              allowanceChangeCount: 0,
            },
          },
          {
            spendUsd: "100",
            amount: "100000000000000000000",
            quoted: false,
            providerCode: "40001",
            quoteError: "bad param",
          },
        ],
      },
    ],
    ttlObservations: [
      {
        platformId: "ondo",
        underlyingTicker: "AAA",
        tokenContractAddress: "0xondoaaa",
        spendUsd: "10",
        waitSeconds: 35,
        expiredQuoteRejected: true,
        reuseProviderCode: "40401",
        matchedDocumentedExpiryCode: true,
        requoted: true,
        firstToTokenAmount: "1000000",
        requotedToTokenAmount: "1001000",
        driftBps: "10",
      },
    ],
    aggregate: {
      representationsAttempted: 5,
      representationsQuoted: 4,
      quoteAttempts: 15,
      quoteAttemptsSucceeded: 12,
      executionModeBreakdown: { SWAP: 12 },
      vendorBreakdown: { LiquidMesh: 12 },
      undocumentedVendors: [],
      undocumentedExecutionModes: [],
      swapAttempts: 12,
      swapTxPayloads: 12,
      swapRfqPayloads: 0,
      simulateAttempts: 12,
      simulateReturned: 12,
      simulateSucceeded: 11,
      simulateByLeg: { swapTx: { attempted: 12, returned: 12, succeeded: 11 } },
      providerCodeBreakdown: { "0": 39, "40001": 3 },
    },
    unknownFields: {},
    status: "COMPLETE",
    incompleteReasons: [],
    ...overrides,
  };
}

describe("renderMarkdown", () => {
  it("renders the headline figures exactly as the JSON holds them", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("- Probe run: `run-1`");
    expect(md).toContain("- Status: **COMPLETE**");
    expect(md).toContain("Representations that quoted at all: 4/5 (80.0%)");
    expect(md).toContain("Quote attempts that succeeded: 12/15 (80.0%)");
    expect(md).toContain("12 tx (SWAP), 0 rfq (RFQ), out of 12 attempts");
    expect(md).toContain("Simulate attempts returning a status: 12/12; non-failing status: 11");
  });

  it("records the probe wallet and the decimals confirmation", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("`0x000000000000000000000000000000000000dEaD`");
    expect(md).toContain("confirmed against live responses: yes");
    expect(md).toContain("symbol observed live: USDT");
  });

  it("says NO when the spend token decimals were never confirmed live", () => {
    const md = renderMarkdown(
      report({
        probeConfig: { ...report().probeConfig, spendTokenDecimalsConfirmedLive: false },
      }),
    );
    expect(md).toContain("confirmed against live responses: NO");
  });

  it("renders the executionMode breakdown against the spec's expectation", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("## executionMode breakdown");
    expect(md).toContain("expected 100% RFQ");
    expect(md).toContain("- SWAP: 12");
  });

  it("names undocumented vendors and execution modes when there are any", () => {
    const md = renderMarkdown(
      report({
        aggregate: {
          ...report().aggregate,
          undocumentedVendors: ["MysteryVendor"],
          undocumentedExecutionModes: ["BRAND_NEW"],
        },
      }),
    );
    expect(md).toContain("MysteryVendor");
    expect(md).toContain("BRAND_NEW");
  });

  it("renders the TTL observation including whether it matched the documented code", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("waited 35s");
    expect(md).toContain("rejected (code 40401)");
    expect(md).toContain("matches documented 40401 QUOTE_EXPIRED: yes");
    expect(md).toContain("re-quote drift: 10 bps (1000000 -> 1001000)");
  });

  it("says plainly when an expired quoteId was NOT rejected", () => {
    const md = renderMarkdown(
      report({
        ttlObservations: [
          {
            // reuseProviderCode is dropped entirely rather than set to
            // undefined: the provider returned no envelope code at all,
            // because it did not reject the reuse.
            ...omitReuseProviderCode(report().ttlObservations[0]!),
            expiredQuoteRejected: false,
            matchedDocumentedExpiryCode: false,
          },
        ],
      }),
    );
    expect(md).toContain("NOT rejected");
    expect(md).toContain("matches documented 40401 QUOTE_EXPIRED: no");
  });

  it("renders per-representation detail including a failed attempt", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("### ondo AAAon (AAA) `0xondoaaa` [multi]");
    expect(md).toContain("$10: 1 route(s), modes [SWAP], vendors [LiquidMesh]");
    expect(md).toContain("toTokenAmount=30218580111383404");
    expect(md).toContain("simulate swapTx -> 0xrouter: status=SUCCESS, failReason=null");
    expect(md).toContain("$100: no quote (code 40001) - bad param");
  });

  it("lists incomplete reasons when the run is not COMPLETE", () => {
    const md = renderMarkdown(
      report({ status: "INCOMPLETE", incompleteReasons: ["quote failed for ondo 0xondoaaa"] }),
    );
    expect(md).toContain("## Incomplete reasons");
    expect(md).toContain("- quote failed for ondo 0xondoaaa");
  });

  it("does not claim a simulation succeeded when none returned", () => {
    const md = renderMarkdown(
      report({
        aggregate: {
          ...report().aggregate,
          simulateAttempts: 3,
          simulateReturned: 0,
          simulateSucceeded: 0,
          simulateByLeg: { approveCalldata: { attempted: 3, returned: 0, succeeded: 0 } },
        },
      }),
    );
    expect(md).toContain("Simulate attempts returning a status: 0/3; non-failing status: 0");
    expect(md).toContain("- approveCalldata: attempted 3, returned a status 0, non-failing 0");
  });

  it("reports shortfalls and unknown fields", () => {
    const md = renderMarkdown(
      report({
        sampling: {
          ...report().sampling,
          shortfalls: [{ platformId: "bstock", requested: 10, available: 4 }],
        },
        unknownFields: { quote: ["brandNewField"] },
      }),
    );
    expect(md).toContain("SHORTFALL: bstock had only 4 single-representation tickers");
    expect(md).toContain("- quote: brandNewField");
  });

  it("renders 'none' rather than an empty section when there is nothing to list", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("## Unknown fields observed\n- none");
  });
});
