import { describe, expect, it } from "vitest";
import { BinanceApiError, type RequestSpec } from "@orchard/binance";
import { runQuoteFeasibilityProbe, type EvidenceOps, type RequestClient } from "./pipeline.js";
import type { TerminalStatus } from "./report.js";

/**
 * Every test here is offline: a stub RequestClient stands in for the provider.
 * No live call is ever made from a unit test (AGENTS.md: live provider calls
 * are run locally by the owner, never in CI).
 */

const CHAIN = "56";
const PROBE_WALLET = "0x000000000000000000000000000000000000dEaD";
const SPEND_TOKEN = "0xspendtoken";

function token(platformId: string, ticker: string, address: string): Record<string, unknown> {
  return {
    binanceChainId: CHAIN,
    tokenContractAddress: address,
    platformId,
    assetType: 1,
    tokenName: `${ticker} token`,
    tokenSymbol: `${ticker}on`,
    tokenLogoUrl: "https://example.invalid/logo.png",
    decimals: "18",
    underlyingTicker: ticker,
    underlyingName: `${ticker} Inc`,
    tokenToShareRatio: "1",
    statusInfo: {
      openState: true,
      marketStatus: "regular",
      reasonCode: null,
      reasonMsg: null,
      nextOpenTime: null,
      nextCloseTime: null,
    },
    tokenPrice: "100",
    referencePrice: "100",
    volume24H: "0",
    marketCap: null,
  };
}

function quoteRoute(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quoteId: "q1",
    vendorName: "LiquidMesh",
    binanceChainId: CHAIN,
    fromTokenAmount: "10000000000000000000",
    toTokenAmount: "30218580111383404",
    tradeFee: "0.02",
    estimateGasFee: "450000",
    priceImpactPercent: "0.0",
    approveTarget: "0xapprovetarget",
    executionMode: "SWAP",
    isBest: true,
    fromToken: { tokenContractAddress: SPEND_TOKEN, tokenSymbol: "USDT", decimal: "18" },
    toToken: { tokenContractAddress: "0xtoken", tokenSymbol: "XXXon", decimal: "18" },
    ...overrides,
  };
}

const SWAP_TX_PAYLOAD = {
  executionMode: "SWAP",
  routerResult: { binanceChainId: CHAIN },
  tx: { from: PROBE_WALLET, to: "0xrouter", data: "0xcafe", value: "0", gas: "250000" },
};

const SWAP_RFQ_PAYLOAD = {
  executionMode: "RFQ",
  routerResult: { binanceChainId: CHAIN },
  rfq: { vendor: "SomeRfqVendor", txType: "EIP712", typedDataToSign: "{}" },
};

interface StubHandlers {
  quote?: (spec: RequestSpec, callIndex: number) => unknown;
  swap?: (spec: RequestSpec, callIndex: number) => unknown;
  approve?: (spec: RequestSpec) => unknown;
  simulate?: (spec: RequestSpec) => unknown;
}

interface Stub {
  client: RequestClient;
  calls: { path: string; query?: RequestSpec["query"]; body?: unknown }[];
}

/** Stub client. A handler that throws models a provider rejection. */
function makeClient(handlers: StubHandlers, tokensByPlatform: Record<string, unknown[]>): Stub {
  const calls: Stub["calls"] = [];
  const counts = new Map<string, number>();
  const client: RequestClient = {
    request<T>(spec: RequestSpec): Promise<{ data: T; envelope: { code: string } }> {
      calls.push({
        path: spec.path,
        ...(spec.query !== undefined ? { query: spec.query } : {}),
        ...(spec.body !== undefined ? { body: spec.body } : {}),
      });
      const n = (counts.get(spec.path) ?? 0) + 1;
      counts.set(spec.path, n);

      let data: unknown;
      if (spec.path === "/api/v1/dex/market/rwa/tokens") {
        const platformId = String(spec.query?.["platformId"]);
        data = tokensByPlatform[platformId] ?? [];
      } else if (spec.path === "/api/v1/dex/aggregator/quote") {
        data = handlers.quote?.(spec, n) ?? [quoteRoute()];
      } else if (spec.path === "/api/v1/dex/aggregator/swap") {
        data = handlers.swap?.(spec, n) ?? SWAP_TX_PAYLOAD;
      } else if (spec.path === "/api/v1/dex/aggregator/approve-transaction") {
        data = handlers.approve?.(spec) ?? { data: "0x095ea7b3", dexContractAddress: "0xspender" };
      } else if (spec.path === "/api/v1/dex/pre-transaction/simulate") {
        data = handlers.simulate?.(spec) ?? {
          status: "SUCCESS",
          failReason: null,
          balanceChanges: [],
          allowanceChanges: [],
        };
      } else {
        throw new Error(`unexpected path ${spec.path}`);
      }
      return Promise.resolve({ data: data as T, envelope: { code: "0" } });
    },
  };
  return { client, calls };
}

function makeEvidence(): { ops: EvidenceOps; closed: { status: TerminalStatus }[] } {
  const closed: { status: TerminalStatus }[] = [];
  return {
    ops: {
      openProbeRun: () => Promise.resolve("run-1"),
      closeProbeRun: (args) => {
        closed.push({ status: args.status });
        return Promise.resolve();
      },
    },
    closed,
  };
}

function baseDeps(
  client: RequestClient,
  evidence: EvidenceOps,
  overrides: Partial<Parameters<typeof runQuoteFeasibilityProbe>[0]> = {},
): Parameters<typeof runQuoteFeasibilityProbe>[0] {
  return {
    client,
    evidence,
    gitSha: "sha",
    clientVersion: "0.0.0",
    targetChainId: CHAIN,
    probeWalletAddress: PROBE_WALLET,
    spendTokenAddress: SPEND_TOKEN,
    spendTokenDecimals: 18,
    spendSizesUsd: ["10"],
    seed: "test-seed",
    singleRepPerPlatform: 1,
    ttlObservationCount: 0,
    now: () => new Date("2026-09-30T00:00:00.000Z"),
    // Never a real wait in a unit test.
    sleep: () => Promise.resolve(),
    ...overrides,
  };
}

const TOKENS = {
  ondo: [token("ondo", "AAA", "0xondoaaa"), token("ondo", "OOO", "0xondoooo")],
  bstock: [token("bstock", "AAA", "0xbstaaa"), token("bstock", "BBB", "0xbstbbb")],
};

describe("runQuoteFeasibilityProbe: happy path", () => {
  it("quotes, swaps and simulates the tx leg, and reports COMPLETE", async () => {
    const stub = makeClient({}, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));

    expect(result.status).toBe("COMPLETE");
    expect(evidence.closed).toEqual([{ status: "COMPLETE" }]);
    // AAA is multi-representation (both platforms); OOO and BBB are single.
    expect(result.report.sampling.multiRepresentationTickers).toEqual(["AAA"]);
    expect(result.report.sampling.multiRepresentationCount).toBe(2);
    expect(result.report.sampling.singleRepresentationCount).toBe(2);
    expect(result.report.aggregate.representationsAttempted).toBe(4);
    expect(result.report.aggregate.representationsQuoted).toBe(4);
    expect(result.report.aggregate.swapTxPayloads).toBe(4);
    expect(result.report.aggregate.swapRfqPayloads).toBe(0);
    expect(result.report.aggregate.simulateByLeg["swapTx"]).toEqual({
      attempted: 4,
      returned: 4,
      succeeded: 4,
    });
    expect(result.report.aggregate.executionModeBreakdown).toEqual({ SWAP: 4 });
    expect(result.report.aggregate.vendorBreakdown).toEqual({ LiquidMesh: 4 });
    expect(result.report.aggregate.undocumentedVendors).toEqual([]);
  });

  it("sends the probe wallet address and the exact smallest-unit amount on every quote", async () => {
    const stub = makeClient({}, TOKENS);
    const evidence = makeEvidence();
    await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));

    const quotes = stub.calls.filter((c) => c.path === "/api/v1/dex/aggregator/quote");
    expect(quotes.length).toBeGreaterThan(0);
    for (const call of quotes) {
      expect(call.query?.["userWalletAddress"]).toBe(PROBE_WALLET);
      expect(call.query?.["amount"]).toBe("10000000000000000000");
    }
  });

  it("always sends a slippagePercent on /swap - live /swap rejects a request without one", async () => {
    // Confirmed live 2026-09-30: /swap answers code 40001 "either
    // slippagePercent or autoSlippage is required" when neither is present,
    // although the doc page lists both as optional.
    const stub = makeClient({}, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(
      baseDeps(stub.client, evidence.ops, { slippagePercent: "0.5", ttlObservationCount: 1 }),
    );

    const swaps = stub.calls.filter((c) => c.path === "/api/v1/dex/aggregator/swap");
    expect(swaps.length).toBeGreaterThan(0);
    for (const call of swaps) {
      expect(call.query?.["slippagePercent"]).toBe("0.5");
    }
    // Including the stale-quoteId reuse call in the TTL observation.
    expect(result.report.probeConfig.slippagePercent).toBe("0.5");
  });

  it("never calls order/submit or broadcast", async () => {
    const stub = makeClient({}, TOKENS);
    const evidence = makeEvidence();
    await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    for (const call of stub.calls) {
      expect(call.path).not.toMatch(/order\/submit/);
      expect(call.path).not.toMatch(/broadcast/);
    }
  });

  it("confirms the spend token decimals against the provider's echoed value", async () => {
    const stub = makeClient({}, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    expect(result.report.probeConfig.spendTokenDecimalsConfirmedLive).toBe(true);
    expect(result.report.probeConfig.spendTokenSymbolObserved).toBe("USDT");
  });

  it("flags a decimals disagreement instead of silently mis-scaling", async () => {
    const stub = makeClient(
      {
        quote: () => [
          quoteRoute({
            fromToken: { tokenContractAddress: SPEND_TOKEN, tokenSymbol: "USDT", decimal: "6" },
          }),
        ],
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    expect(result.status).toBe("INCOMPLETE");
    expect(result.incompleteReasons.some((r) => /decimals mismatch/.test(r))).toBe(true);
  });
});

describe("runQuoteFeasibilityProbe: RFQ path (approve leg)", () => {
  it("does not simulate typedDataToSign, and simulates the approve calldata against the token contract", async () => {
    const stub = makeClient({ swap: () => SWAP_RFQ_PAYLOAD }, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));

    expect(result.report.aggregate.swapRfqPayloads).toBe(4);
    expect(result.report.aggregate.simulateByLeg["approveCalldata"]?.attempted).toBe(4);
    expect(result.report.aggregate.simulateByLeg["swapTx"]).toBeUndefined();

    const approves = stub.calls.filter(
      (c) => c.path === "/api/v1/dex/aggregator/approve-transaction",
    );
    expect(approves).toHaveLength(4);
    // The rfq vendor is passed through as `vendor`.
    expect(approves[0]!.query?.["vendor"]).toBe("SomeRfqVendor");
    expect(approves[0]!.query?.["tokenContractAddress"]).toBe(SPEND_TOKEN);

    const sims = stub.calls.filter((c) => c.path === "/api/v1/dex/pre-transaction/simulate");
    expect(sims).toHaveLength(4);
    const body = sims[0]!.body as { evmTx: Record<string, string> };
    // An ERC-20 approve targets the TOKEN contract, never the spender.
    expect(body.evmTx["to"]).toBe(SPEND_TOKEN);
    expect(body.evmTx["from"]).toBe(PROBE_WALLET);
    expect(body.evmTx["value"]).toBe("0");
    expect(body.evmTx["data"]).toBe("0x095ea7b3");
    // typedDataToSign is never sent anywhere.
    expect(JSON.stringify(sims)).not.toMatch(/typedDataToSign/);
  });

  it("records a failed approve leg without aborting the run", async () => {
    const stub = makeClient(
      {
        swap: () => SWAP_RFQ_PAYLOAD,
        approve: () => {
          throw new BinanceApiError({ code: "50000", message: "vendor unsupported" }, 200);
        },
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));

    expect(result.status).toBe("INCOMPLETE");
    expect(result.report.aggregate.simulateAttempts).toBe(0);
    const firstAttempt = result.report.results[0]!.attempts[0]!;
    expect(firstAttempt.approve?.succeeded).toBe(false);
    expect(firstAttempt.approve?.providerCode).toBe("50000");
    expect(result.report.aggregate.providerCodeBreakdown["50000"]).toBe(4);
  });

  it("records a simulate that returns a failing status without calling it a success", async () => {
    const stub = makeClient(
      {
        swap: () => SWAP_RFQ_PAYLOAD,
        simulate: () => ({
          status: "REVERTED",
          failReason: "ERC20: insufficient allowance",
          balanceChanges: [],
          allowanceChanges: [],
        }),
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    const leg = result.report.aggregate.simulateByLeg["approveCalldata"]!;
    expect(leg.attempted).toBe(4);
    expect(leg.returned).toBe(4);
    expect(leg.succeeded).toBe(0);
    expect(result.report.results[0]!.attempts[0]!.simulate?.failReason).toBe(
      "ERC20: insufficient allowance",
    );
  });
});

describe("runQuoteFeasibilityProbe: fail-closed per representation", () => {
  it("one quote failure does not abort the run", async () => {
    let calls = 0;
    const stub = makeClient(
      {
        quote: () => {
          calls += 1;
          if (calls === 1) throw new BinanceApiError({ code: "40001", message: "bad param" }, 200);
          return [quoteRoute()];
        },
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));

    expect(result.status).toBe("INCOMPLETE");
    expect(result.report.aggregate.representationsAttempted).toBe(4);
    expect(result.report.aggregate.representationsQuoted).toBe(3);
    expect(result.report.results[0]!.attempts[0]!.quoted).toBe(false);
    expect(result.report.results[0]!.attempts[0]!.providerCode).toBe("40001");
    expect(result.incompleteReasons.some((r) => /quote failed/.test(r))).toBe(true);
  });

  it("a zero-route quote is recorded, not treated as an error or a success", async () => {
    const stub = makeClient({ quote: () => [] }, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    expect(result.report.aggregate.representationsQuoted).toBe(0);
    expect(result.report.aggregate.swapAttempts).toBe(0);
    expect(result.report.results[0]!.attempts[0]!.quoteError).toBe("quote returned zero routes");
  });

  it("a swap failure leaves the quote evidence intact and continues", async () => {
    const stub = makeClient(
      {
        swap: () => {
          throw new BinanceApiError({ code: "40401", message: "quote expired" }, 200);
        },
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    expect(result.status).toBe("INCOMPLETE");
    expect(result.report.aggregate.quoteAttemptsSucceeded).toBe(4);
    expect(result.report.aggregate.simulateAttempts).toBe(0);
    expect(result.report.results[0]!.attempts[0]!.swap?.providerCode).toBe("40401");
  });

  it("a universe fetch failure is FAILED, with no report claiming completeness", async () => {
    const client: RequestClient = {
      request: () => Promise.reject(new Error("network down")),
    };
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(client, evidence.ops));
    expect(result.status).toBe("FAILED");
    expect(result.report.status).toBe("FAILED");
    expect(result.report.aggregate.representationsAttempted).toBe(0);
    expect(evidence.closed).toEqual([{ status: "FAILED" }]);
  });
});

describe("runQuoteFeasibilityProbe: undocumented values are surfaced", () => {
  it("flags an executionMode and vendorName outside every documented list", async () => {
    const stub = makeClient(
      {
        quote: () => [quoteRoute({ executionMode: "BRAND_NEW", vendorName: "MysteryVendor" })],
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    expect(result.report.aggregate.undocumentedExecutionModes).toEqual(["BRAND_NEW"]);
    expect(result.report.aggregate.undocumentedVendors).toEqual(["MysteryVendor"]);
  });

  it("reports unknown response fields per endpoint", async () => {
    const stub = makeClient({ quote: () => [quoteRoute({ brandNewField: 1 })] }, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    expect(result.report.unknownFields["quote"]).toEqual(["brandNewField"]);
  });

  it("records a route that was used despite no isBest flag", async () => {
    const stub = makeClient({ quote: () => [quoteRoute({ isBest: false })] }, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(baseDeps(stub.client, evidence.ops));
    expect(result.report.results[0]!.attempts[0]!.best?.isBestFlagged).toBe(false);
  });
});

describe("runQuoteFeasibilityProbe: quoteId TTL observation", () => {
  it("records a documented 40401 rejection and the re-quote drift", async () => {
    let swapCalls = 0;
    const stub = makeClient(
      {
        quote: (_spec, n) =>
          n === 1
            ? [quoteRoute({ toTokenAmount: "1000000" })]
            : [quoteRoute({ quoteId: "q2", toTokenAmount: "1001000" })],
        swap: () => {
          swapCalls += 1;
          // The first /swap is the normal one; the second reuses the stale id.
          if (swapCalls === 2) {
            throw new BinanceApiError({ code: "40401", message: "QUOTE_EXPIRED" }, 200);
          }
          return SWAP_TX_PAYLOAD;
        },
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(
      baseDeps(stub.client, evidence.ops, { ttlObservationCount: 1, ttlWaitSeconds: 35 }),
    );

    expect(result.report.ttlObservations).toHaveLength(1);
    const obs = result.report.ttlObservations[0]!;
    expect(obs.waitSeconds).toBe(35);
    expect(obs.expiredQuoteRejected).toBe(true);
    expect(obs.reuseProviderCode).toBe("40401");
    expect(obs.matchedDocumentedExpiryCode).toBe(true);
    expect(obs.requoted).toBe(true);
    // (1001000 - 1000000) / 1000000 * 10000 = 10 bps, exact.
    expect(obs.driftBps).toBe("10");
  });

  it("records the actual code when an expired quoteId is rejected some other way", async () => {
    let swapCalls = 0;
    const stub = makeClient(
      {
        swap: () => {
          swapCalls += 1;
          if (swapCalls === 2) {
            throw new BinanceApiError({ code: "40462", message: "SWAP_QUOTE_MISMATCH" }, 200);
          }
          return SWAP_TX_PAYLOAD;
        },
      },
      TOKENS,
    );
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(
      baseDeps(stub.client, evidence.ops, { ttlObservationCount: 1 }),
    );
    const obs = result.report.ttlObservations[0]!;
    expect(obs.expiredQuoteRejected).toBe(true);
    expect(obs.reuseProviderCode).toBe("40462");
    expect(obs.matchedDocumentedExpiryCode).toBe(false);
  });

  it("records the case where an expired quoteId is NOT rejected at all", async () => {
    const stub = makeClient({}, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(
      baseDeps(stub.client, evidence.ops, { ttlObservationCount: 1 }),
    );
    const obs = result.report.ttlObservations[0]!;
    expect(obs.expiredQuoteRejected).toBe(false);
    expect(obs.matchedDocumentedExpiryCode).toBe(false);
  });

  it("makes only the budgeted number of TTL observations", async () => {
    const stub = makeClient({}, TOKENS);
    const evidence = makeEvidence();
    const result = await runQuoteFeasibilityProbe(
      baseDeps(stub.client, evidence.ops, { ttlObservationCount: 2 }),
    );
    expect(result.report.ttlObservations).toHaveLength(2);
  });
});
