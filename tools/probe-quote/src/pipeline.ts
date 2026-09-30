import {
  BinanceApiError,
  approveTransactionDataSchema,
  approveTransactionSchema,
  approveTransactionsOf,
  buildApproveTransactionRequest,
  buildQuoteRequest,
  buildSimulateRequest,
  buildSwapRequest,
  isDocumentedExecutionMode,
  isDocumentedVendorName,
  quoteDataSchema,
  quoteRouteSchema,
  simulateDataSchema,
  swapDataSchema,
  swapPayloadOf,
  TRADING_DOCUMENTED_CODES,
  type QuoteRoute,
  type RequestSpec,
  type SimulateData,
  type SwapData,
} from "@orchard/binance";
import {
  bpsDifference,
  groupByUnderlyingTicker,
  partitionCompleteTokens,
  toRepresentation,
  tokensDataSchema,
  tokenSchema,
  tryParseDecimal,
  unknownArrayItemKeys,
  unknownObjectKeys,
  type TokenRepresentation,
} from "@orchard/rwa";
import { buildSampleSet, usdToSmallestUnit, type SampleSet } from "./sampling.js";
import type {
  QuoteAttempt,
  QuoteFeasibilityReport,
  RepresentationResult,
  SimulateAttempt,
  TerminalStatus,
  TtlObservation,
} from "./report.js";

export interface RequestClient {
  /**
   * `envelope.code` is `string | number` because the provider sends a JSON
   * number. Always normalize it with `String()` before comparing or counting.
   */
  request<T>(spec: RequestSpec): Promise<{ data: T; envelope: { code: string | number } }>;
}

export interface EvidenceOps {
  openProbeRun(args: { gitSha: string; clientVersion: string }): Promise<string>;
  closeProbeRun(args: {
    probeRunId: string;
    status: TerminalStatus;
    incompleteReasons?: readonly string[];
  }): Promise<void>;
}

export interface RunQuoteProbeDeps {
  client: RequestClient;
  evidence: EvidenceOps;
  gitSha: string;
  clientVersion: string;
  targetChainId: string;
  /**
   * Read-only probe wallet address (DEC-028). Confirmed live on 2026-09-29
   * that a zero-balance burn address is accepted by /quote, and that omitting
   * this parameter is rejected with envelope code 40001 despite the doc page
   * marking it optional.
   */
  probeWalletAddress: string;
  /** Spend token (USDT on BSC by default via the CLI). */
  spendTokenAddress: string;
  /**
   * Decimals used to build smallest-unit amounts. Verified against every
   * quote response's echoed fromToken.decimal rather than trusted: a
   * disagreement makes the run INCOMPLETE instead of silently mis-scaling.
   */
  spendTokenDecimals: number;
  /** Whole-USD spend sizes. Default $10/$100/$1000 (spec T3). */
  spendSizesUsd?: readonly string[];
  /**
   * slippagePercent sent on every /swap. Live /swap rejects a request carrying
   * neither slippagePercent nor autoSlippage with code 40001 ("either
   * slippagePercent or autoSlippage is required"), even though the doc page
   * lists both as optional - confirmed 2026-09-30. Recorded in the report,
   * since slippage determines the built tx's minReceiveAmount.
   */
  slippagePercent?: string;
  /** Seed for the single-representation draw. */
  seed: string;
  singleRepPerPlatform?: number;
  /**
   * How many quoteId-reuse/TTL observations to make in a run. Each costs a
   * >30s wait, and TTL is a property of the endpoint rather than of a token,
   * so the default is 1 - a deliberate narrowing of spec T3 step 6, recorded
   * in the report.
   */
  ttlObservationCount?: number;
  /** Seconds to wait before reusing a quoteId. Default 35 (past the documented ~30s TTL). */
  ttlWaitSeconds?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunQuoteProbeResult {
  probeRunId: string;
  status: TerminalStatus;
  incompleteReasons: string[];
  report: QuoteFeasibilityReport;
}

const DEFAULT_SPEND_SIZES_USD = ["10", "100", "1000"] as const;
const DEFAULT_TTL_OBSERVATION_COUNT = 1;
/** Neither documented nor derived - a probe input, recorded in the report. */
const DEFAULT_SLIPPAGE_PERCENT = "0.5";
const DEFAULT_TTL_WAIT_SECONDS = 35;
const PLATFORM_IDS = ["ondo", "bstock"] as const;

/**
 * Simulate statuses that mean the dry run did not fail. Checked
 * case-insensitively against the provider's verbatim status. Anything not
 * matched is reported as its own value rather than being called a success -
 * the doc page gives SUCCESS only as an example, so this is a read of what
 * came back, not a documented enumeration.
 */
const NON_FAILING_SIMULATE_STATUSES = new Set(["success", "ok"]);

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function providerCodeOf(err: unknown): string | undefined {
  return err instanceof BinanceApiError ? err.code : undefined;
}

function isNonFailingStatus(status: string): boolean {
  return NON_FAILING_SIMULATE_STATUSES.has(status.toLowerCase());
}

/**
 * `pnpm probe:quote` pipeline (F001B-spec.md T3).
 *
 * Fail-closed per representation and per spend size, exactly like F001-A: a
 * failed quote, swap, approve or simulate is recorded on that attempt and
 * added to incompleteReasons, never allowed to abort the run. Only the
 * universe fetch is fatal - without it there is nothing to sample.
 *
 * Nothing here signs, submits or broadcasts anything (F001-B section 4).
 */
export async function runQuoteFeasibilityProbe(
  deps: RunQuoteProbeDeps,
): Promise<RunQuoteProbeResult> {
  const now = deps.now ?? ((): Date => new Date());
  const sleep =
    deps.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)));
  const spendSizes = deps.spendSizesUsd ?? DEFAULT_SPEND_SIZES_USD;
  const ttlWaitSeconds = deps.ttlWaitSeconds ?? DEFAULT_TTL_WAIT_SECONDS;
  const ttlObservationBudget = deps.ttlObservationCount ?? DEFAULT_TTL_OBSERVATION_COUNT;
  const slippagePercent = deps.slippagePercent ?? DEFAULT_SLIPPAGE_PERCENT;

  const probeRunId = await deps.evidence.openProbeRun({
    gitSha: deps.gitSha,
    clientVersion: deps.clientVersion,
  });

  const reasons: string[] = [];
  const unknownFields: Record<string, string[]> = {};
  const providerCodes: Record<string, number> = {};
  const recordCode = (code: string | undefined): void => {
    if (code === undefined) return;
    providerCodes[code] = (providerCodes[code] ?? 0) + 1;
  };

  // --- universe: the F001-A representation set, via F001-A's own code path ---
  let universe: TokenRepresentation[];
  let symbolByKey: Map<string, string>;
  try {
    const fetched = await fetchUniverse(deps, unknownFields);
    universe = fetched.representations;
    symbolByKey = fetched.symbolByKey;
  } catch (err) {
    const reason = `failed to build the representation universe: ${describeError(err)}`;
    await deps.evidence.closeProbeRun({
      probeRunId,
      status: "FAILED",
      incompleteReasons: [reason],
    });
    return {
      probeRunId,
      status: "FAILED",
      incompleteReasons: [reason],
      report: emptyReport(probeRunId, deps, now(), "FAILED", [reason]),
    };
  }

  const groups = groupByUnderlyingTicker(universe);
  const sample: SampleSet = buildSampleSet(groups, {
    seed: deps.seed,
    ...(deps.singleRepPerPlatform !== undefined
      ? { singleRepPerPlatform: deps.singleRepPerPlatform }
      : {}),
  });
  for (const s of sample.shortfalls) {
    reasons.push(
      `platform ${s.platformId} had only ${s.available} single-representation tickers, ${s.requested} requested`,
    );
  }

  const multiKeys = new Set(
    sample.multiRepresentation.map((r) => `${r.binanceChainId}:${r.tokenContractAddress}`),
  );

  // --- amounts, exact, decimal.js only ---
  const amountByUsd = new Map<string, string>();
  try {
    for (const usd of spendSizes) {
      amountByUsd.set(usd, usdToSmallestUnit(usd, deps.spendTokenDecimals));
    }
  } catch (err) {
    const reason = `failed to build spend amounts: ${describeError(err)}`;
    await deps.evidence.closeProbeRun({
      probeRunId,
      status: "FAILED",
      incompleteReasons: [reason],
    });
    return {
      probeRunId,
      status: "FAILED",
      incompleteReasons: [reason],
      report: emptyReport(probeRunId, deps, now(), "FAILED", [reason]),
    };
  }

  const results: RepresentationResult[] = [];
  const ttlObservations: TtlObservation[] = [];
  const executionModeBreakdown: Record<string, number> = {};
  const vendorBreakdown: Record<string, number> = {};
  const undocumentedVendors = new Set<string>();
  const undocumentedExecutionModes = new Set<string>();
  const simulateByLeg: Record<string, { attempted: number; returned: number; succeeded: number }> =
    {};
  let spendTokenSymbolObserved: string | undefined;
  let spendTokenDecimalsConfirmedLive = false;

  let quoteAttempts = 0;
  let quoteAttemptsSucceeded = 0;
  let swapAttempts = 0;
  let swapTxPayloads = 0;
  let swapRfqPayloads = 0;
  let simulateAttempts = 0;
  let simulateReturned = 0;
  let simulateSucceeded = 0;
  let ttlObservationsRemaining = ttlObservationBudget;

  for (const rep of sample.all) {
    const repKey = `${rep.binanceChainId}:${rep.tokenContractAddress}`;
    const repResult: RepresentationResult = {
      platformId: rep.platformId,
      underlyingTicker: rep.underlyingTicker,
      binanceChainId: rep.binanceChainId,
      tokenContractAddress: rep.tokenContractAddress,
      // TokenRepresentation carries no tokenSymbol; it comes from the same
      // /rwa/tokens response the universe was built from.
      tokenSymbol: symbolByKey.get(repKey) ?? "(unknown)",
      sampleGroup: multiKeys.has(repKey) ? "multi" : "single",
      attempts: [],
    };

    for (const usd of spendSizes) {
      const amount = amountByUsd.get(usd)!;
      const attempt: QuoteAttempt = { spendUsd: usd, amount, quoted: false };
      quoteAttempts += 1;

      // --- step 1-2: quote ---
      let routes: QuoteRoute[] = [];
      try {
        const spec = buildQuoteRequest({
          binanceChainId: rep.binanceChainId,
          amount,
          fromTokenAddress: deps.spendTokenAddress,
          toTokenAddress: rep.tokenContractAddress,
          userWalletAddress: deps.probeWalletAddress,
        });
        const res = await deps.client.request<unknown>(spec);
        recordCode(String(res.envelope.code));
        routes = quoteDataSchema.parse(res.data);
        const extra = unknownArrayItemKeys(
          quoteRouteSchema.shape,
          res.data as Record<string, unknown>[],
        );
        if (extra.length) mergeUnknown(unknownFields, "quote", extra);
      } catch (err) {
        recordCode(providerCodeOf(err));
        attempt.quoteError = describeError(err);
        const code = providerCodeOf(err);
        if (code !== undefined) attempt.providerCode = code;
        reasons.push(
          `quote failed for ${rep.platformId} ${rep.tokenContractAddress} at $${usd}: ${attempt.quoteError}`,
        );
        repResult.attempts.push(attempt);
        continue;
      }

      if (routes.length === 0) {
        attempt.routeCount = 0;
        attempt.quoteError = "quote returned zero routes";
        repResult.attempts.push(attempt);
        continue;
      }

      attempt.quoted = true;
      quoteAttemptsSucceeded += 1;
      attempt.routeCount = routes.length;
      attempt.executionModes = [
        ...new Set(routes.map((r) => r.executionMode ?? "(absent)")),
      ].sort();
      attempt.vendorNames = [...new Set(routes.map((r) => r.vendorName))].sort();

      for (const route of routes) {
        const mode = route.executionMode ?? "(absent)";
        executionModeBreakdown[mode] = (executionModeBreakdown[mode] ?? 0) + 1;
        if (route.executionMode !== undefined && !isDocumentedExecutionMode(route.executionMode)) {
          undocumentedExecutionModes.add(route.executionMode);
        }
        vendorBreakdown[route.vendorName] = (vendorBreakdown[route.vendorName] ?? 0) + 1;
        if (!isDocumentedVendorName(route.vendorName)) undocumentedVendors.add(route.vendorName);

        // The configured spend-token decimals are only trustworthy if the
        // provider echoes the same value back. Checked on every route.
        const echoed = route.fromToken?.decimal;
        if (echoed !== undefined) {
          if (Number(echoed) === deps.spendTokenDecimals) {
            spendTokenDecimalsConfirmedLive = true;
          } else {
            reasons.push(
              `spend token decimals mismatch: configured ${deps.spendTokenDecimals}, provider echoed "${echoed}" ` +
                `for ${rep.platformId} ${rep.tokenContractAddress} at $${usd} - amounts may be mis-scaled`,
            );
          }
        }
        if (spendTokenSymbolObserved === undefined && route.fromToken?.tokenSymbol !== undefined) {
          spendTokenSymbolObserved = route.fromToken.tokenSymbol;
        }
      }

      const flagged = routes.find((r) => r.isBest === true);
      const best = flagged ?? routes[0]!;
      attempt.best = {
        quoteId: best.quoteId,
        vendorName: best.vendorName,
        toTokenAmount: best.toTokenAmount,
        isBestFlagged: flagged !== undefined,
        ...(best.executionMode !== undefined ? { executionMode: best.executionMode } : {}),
        ...(best.priceImpactPercent !== undefined
          ? { priceImpactPercent: best.priceImpactPercent }
          : {}),
        ...(best.tradeFee !== undefined ? { tradeFee: best.tradeFee } : {}),
        ...(best.estimateGasFee !== undefined ? { estimateGasFee: best.estimateGasFee } : {}),
        ...(best.approveTarget !== undefined ? { approveTarget: best.approveTarget } : {}),
      };

      // --- step 3: swap for the best route ---
      swapAttempts += 1;
      let swapData: SwapData | undefined;
      try {
        const res = await deps.client.request<unknown>(
          buildSwapRequest({
            binanceChainId: rep.binanceChainId,
            amount,
            fromTokenAddress: deps.spendTokenAddress,
            toTokenAddress: rep.tokenContractAddress,
            userWalletAddress: deps.probeWalletAddress,
            quoteId: best.quoteId,
            slippagePercent,
          }),
        );
        recordCode(String(res.envelope.code));
        swapData = swapDataSchema.parse(res.data);
        const extra = unknownObjectKeys(swapDataSchema.shape, res.data as Record<string, unknown>);
        if (extra.length) mergeUnknown(unknownFields, "swap", extra);
      } catch (err) {
        recordCode(providerCodeOf(err));
        const code = providerCodeOf(err);
        attempt.swap = {
          attempted: true,
          succeeded: false,
          error: describeError(err),
          ...(code !== undefined ? { providerCode: code } : {}),
        };
        reasons.push(
          `swap failed for ${rep.platformId} ${rep.tokenContractAddress} at $${usd}: ${describeError(err)}`,
        );
        repResult.attempts.push(attempt);
        continue;
      }

      // /swap sends BOTH tx and rfq keys, the inapplicable one as JSON null
      // (confirmed live 2026-09-30), so presence is not enough - read the leg
      // through swapPayloadOf, which collapses null to absent.
      const payload = swapPayloadOf(swapData);
      if (payload.tx !== undefined) swapTxPayloads += 1;
      if (payload.rfq !== undefined) swapRfqPayloads += 1;
      attempt.swap = {
        attempted: true,
        succeeded: true,
        payload: payload.kind,
        ...(swapData.executionMode !== undefined ? { executionMode: swapData.executionMode } : {}),
        ...(payload.tx !== undefined ? { txFields: Object.keys(payload.tx).sort() } : {}),
        ...(payload.rfq !== undefined ? { rfqFields: Object.keys(payload.rfq).sort() } : {}),
        ...(payload.rfq !== undefined ? { rfqVendor: payload.rfq.vendor } : {}),
      };

      // --- step 4: simulate a real tx when there is one ---
      if (payload.tx !== undefined) {
        const tx = payload.tx;
        const sim = await attemptSimulate(deps, "swapTx", rep.binanceChainId, {
          from: tx.from,
          to: tx.to,
          value: tx.value,
          data: tx.data,
        });
        attempt.simulate = sim.attempt;
        recordCode(sim.providerCode);
        if (sim.unknownKeys.length) mergeUnknown(unknownFields, "simulate", sim.unknownKeys);
        countSimulate(simulateByLeg, sim.attempt);
        simulateAttempts += 1;
        if (sim.attempt.returned) simulateReturned += 1;
        if (sim.attempt.status !== undefined && isNonFailingStatus(sim.attempt.status)) {
          simulateSucceeded += 1;
        }
        if (!sim.attempt.returned) {
          reasons.push(
            `simulate (swapTx) returned no status for ${rep.platformId} ${rep.tokenContractAddress} at $${usd}: ${sim.attempt.error ?? "unknown"}`,
          );
        }
      } else if (payload.rfq !== undefined) {
        // --- step 5: RFQ path. typedDataToSign is EIP-712, not an evmTx, so
        // it is never sent to simulate. The approve leg is the only real
        // calldata available - this is the empirical test of whether
        // "simulate the approve leg" works at all.
        const rfqVendor = payload.rfq.vendor;
        let approveCalldata: { to: string; data: string } | undefined;
        try {
          const res = await deps.client.request<unknown>(
            buildApproveTransactionRequest({
              binanceChainId: rep.binanceChainId,
              tokenContractAddress: deps.spendTokenAddress,
              approveAmount: amount,
              vendor: rfqVendor,
            }),
          );
          recordCode(String(res.envelope.code));
          const parsed = approveTransactionDataSchema.parse(res.data);
          const list = approveTransactionsOf(parsed);
          const first = list[0];
          const extra = Array.isArray(res.data)
            ? unknownArrayItemKeys(
                approveTransactionSchema.shape,
                res.data as Record<string, unknown>[],
              )
            : unknownObjectKeys(
                approveTransactionSchema.shape,
                res.data as Record<string, unknown>,
              );
          if (extra.length) mergeUnknown(unknownFields, "approve-transaction", extra);

          attempt.approve = {
            attempted: true,
            vendor: rfqVendor,
            succeeded: first !== undefined,
            payloadShape: Array.isArray(parsed) ? "array" : "object",
            ...(first !== undefined ? { spenderAddress: first.dexContractAddress } : {}),
            ...(first === undefined ? { error: "approve-transaction returned no entry" } : {}),
          };
          if (first !== undefined) {
            // An ERC-20 approve() is a call to the TOKEN contract; the spender
            // (dexContractAddress) is an argument already encoded in the
            // calldata, never the transaction target.
            approveCalldata = { to: deps.spendTokenAddress, data: first.data };
          }
        } catch (err) {
          recordCode(providerCodeOf(err));
          const code = providerCodeOf(err);
          attempt.approve = {
            attempted: true,
            vendor: rfqVendor,
            succeeded: false,
            error: describeError(err),
            ...(code !== undefined ? { providerCode: code } : {}),
          };
          reasons.push(
            `approve-transaction failed for vendor ${rfqVendor} at $${usd}: ${describeError(err)}`,
          );
        }

        if (approveCalldata !== undefined) {
          const sim = await attemptSimulate(deps, "approveCalldata", rep.binanceChainId, {
            from: deps.probeWalletAddress,
            to: approveCalldata.to,
            value: "0",
            data: approveCalldata.data,
          });
          attempt.simulate = sim.attempt;
          recordCode(sim.providerCode);
          if (sim.unknownKeys.length) mergeUnknown(unknownFields, "simulate", sim.unknownKeys);
          countSimulate(simulateByLeg, sim.attempt);
          simulateAttempts += 1;
          if (sim.attempt.returned) simulateReturned += 1;
          if (sim.attempt.status !== undefined && isNonFailingStatus(sim.attempt.status)) {
            simulateSucceeded += 1;
          }
          if (!sim.attempt.returned) {
            reasons.push(
              `simulate (approveCalldata) returned no status for vendor ${rfqVendor} at $${usd}: ${sim.attempt.error ?? "unknown"}`,
            );
          }
        }
      }

      // --- step 6: quoteId reuse past the documented TTL ---
      if (ttlObservationsRemaining > 0) {
        ttlObservationsRemaining -= 1;
        const observation = await observeTtl(deps, {
          rep,
          usd,
          amount,
          firstQuoteId: best.quoteId,
          firstToTokenAmount: best.toTokenAmount,
          waitSeconds: ttlWaitSeconds,
          slippagePercent,
          sleep,
          recordCode,
        });
        ttlObservations.push(observation);
        if (observation.error !== undefined) {
          reasons.push(
            `TTL observation for ${rep.platformId} ${rep.tokenContractAddress} at $${usd}: ${observation.error}`,
          );
        }
      }

      repResult.attempts.push(attempt);
    }

    results.push(repResult);
  }

  if (!spendTokenDecimalsConfirmedLive && quoteAttemptsSucceeded > 0) {
    reasons.push(
      `no live response echoed the spend token's decimals, so the configured value ` +
        `(${deps.spendTokenDecimals}) is unconfirmed - amounts are UNVERIFIED`,
    );
  }

  const representationsQuoted = results.filter((r) => r.attempts.some((a) => a.quoted)).length;
  const status: TerminalStatus = reasons.length > 0 ? "INCOMPLETE" : "COMPLETE";

  const report: QuoteFeasibilityReport = {
    probeRunId,
    gitSha: deps.gitSha,
    generatedAt: now().toISOString(),
    sampling: {
      seed: sample.seed,
      singleRepPerPlatform: sample.singleRepPerPlatform,
      multiRepresentationTickerCount: sample.multiRepresentationTickers.length,
      multiRepresentationTickers: sample.multiRepresentationTickers,
      multiRepresentationCount: sample.multiRepresentation.length,
      singleRepresentationCount: sample.singleRepresentation.length,
      totalRepresentations: sample.all.length,
      shortfalls: sample.shortfalls,
      universeRepresentations: universe.length,
      universeUnderlyings: groups.size,
    },
    probeConfig: {
      userWalletAddress: deps.probeWalletAddress,
      spendTokenAddress: deps.spendTokenAddress,
      spendTokenDecimals: deps.spendTokenDecimals,
      spendTokenDecimalsConfirmedLive,
      spendSizesUsd: [...spendSizes],
      slippagePercent,
      ...(spendTokenSymbolObserved !== undefined
        ? { spendTokenSymbolObserved: spendTokenSymbolObserved }
        : {}),
    },
    results,
    ttlObservations,
    aggregate: {
      representationsAttempted: results.length,
      representationsQuoted,
      quoteAttempts,
      quoteAttemptsSucceeded,
      executionModeBreakdown,
      vendorBreakdown,
      undocumentedVendors: [...undocumentedVendors].sort(),
      undocumentedExecutionModes: [...undocumentedExecutionModes].sort(),
      swapAttempts,
      swapTxPayloads,
      swapRfqPayloads,
      simulateAttempts,
      simulateReturned,
      simulateSucceeded,
      simulateByLeg,
      providerCodeBreakdown: providerCodes,
    },
    unknownFields,
    status,
    incompleteReasons: reasons,
  };

  await deps.evidence.closeProbeRun({
    probeRunId,
    status,
    ...(reasons.length > 0 ? { incompleteReasons: reasons } : {}),
  });

  return { probeRunId, status, incompleteReasons: reasons, report };
}

/**
 * Rebuilds F001-A's representation universe through F001-A's own schemas,
 * partitioning and grouping code (packages/rwa), so the sample set is the same
 * set F001-A reported on rather than a re-derivation.
 */
async function fetchUniverse(
  deps: RunQuoteProbeDeps,
  unknownFields: Record<string, string[]>,
): Promise<{ representations: TokenRepresentation[]; symbolByKey: Map<string, string> }> {
  const representations: TokenRepresentation[] = [];
  const symbolByKey = new Map<string, string>();
  for (const platformId of PLATFORM_IDS) {
    const raw = (
      await deps.client.request<unknown>({
        method: "GET",
        path: "/api/v1/dex/market/rwa/tokens",
        query: { binanceChainId: deps.targetChainId, platformId },
      })
    ).data;
    const tokens = tokensDataSchema.parse(raw);
    const extra = unknownArrayItemKeys(tokenSchema.shape, raw as Record<string, unknown>[]);
    if (extra.length) mergeUnknown(unknownFields, `tokens:${platformId}`, extra);
    const { complete } = partitionCompleteTokens(tokens);
    for (const token of complete) {
      symbolByKey.set(`${token.binanceChainId}:${token.tokenContractAddress}`, token.tokenSymbol);
    }
    representations.push(...complete.map(toRepresentation));
  }
  if (representations.length === 0) {
    throw new Error("no complete token representations returned for any platform");
  }
  return { representations, symbolByKey };
}

interface SimulateOutcome {
  attempt: SimulateAttempt;
  providerCode: string | undefined;
  unknownKeys: string[];
}

async function attemptSimulate(
  deps: RunQuoteProbeDeps,
  leg: SimulateAttempt["leg"],
  binanceChainId: string,
  evmTx: { from: string; to: string; value: string; data: string },
): Promise<SimulateOutcome> {
  try {
    const res = await deps.client.request<unknown>(buildSimulateRequest({ binanceChainId, evmTx }));
    const data: SimulateData = simulateDataSchema.parse(res.data);
    const unknownKeys = unknownObjectKeys(
      simulateDataSchema.shape,
      res.data as Record<string, unknown>,
    );
    return {
      attempt: {
        leg,
        to: evmTx.to,
        returned: true,
        status: data.status,
        failReason: data.failReason ?? null,
        balanceChangeCount: data.balanceChanges?.length ?? 0,
        allowanceChangeCount: data.allowanceChanges?.length ?? 0,
      },
      providerCode: String(res.envelope.code),
      unknownKeys,
    };
  } catch (err) {
    const code = providerCodeOf(err);
    return {
      attempt: {
        leg,
        to: evmTx.to,
        returned: false,
        error: describeError(err),
        ...(code !== undefined ? { providerCode: code } : {}),
      },
      providerCode: code,
      unknownKeys: [],
    };
  }
}

async function observeTtl(
  deps: RunQuoteProbeDeps,
  args: {
    rep: TokenRepresentation;
    usd: string;
    amount: string;
    firstQuoteId: string;
    firstToTokenAmount: string;
    waitSeconds: number;
    slippagePercent: string;
    sleep: (ms: number) => Promise<void>;
    recordCode: (code: string | undefined) => void;
  },
): Promise<TtlObservation> {
  const { rep, usd, amount, firstQuoteId, firstToTokenAmount, waitSeconds, sleep, recordCode } =
    args;
  const observation: TtlObservation = {
    platformId: rep.platformId,
    underlyingTicker: rep.underlyingTicker,
    tokenContractAddress: rep.tokenContractAddress,
    spendUsd: usd,
    waitSeconds,
    expiredQuoteRejected: false,
    matchedDocumentedExpiryCode: false,
    requoted: false,
  };

  await sleep(waitSeconds * 1_000);

  // Reuse the now-stale quoteId. Rejection is the expected outcome; the point
  // is to record HOW it is rejected, not to assume 40401.
  try {
    await deps.client.request<unknown>(
      buildSwapRequest({
        binanceChainId: rep.binanceChainId,
        amount,
        fromTokenAddress: deps.spendTokenAddress,
        toTokenAddress: rep.tokenContractAddress,
        userWalletAddress: deps.probeWalletAddress,
        quoteId: firstQuoteId,
        slippagePercent: args.slippagePercent,
      }),
    );
    observation.expiredQuoteRejected = false;
  } catch (err) {
    const code = providerCodeOf(err);
    recordCode(code);
    observation.expiredQuoteRejected = true;
    observation.reuseErrorMessage = describeError(err);
    if (code !== undefined) {
      observation.reuseProviderCode = code;
      observation.matchedDocumentedExpiryCode = code === TRADING_DOCUMENTED_CODES.quoteExpired;
    }
  }

  try {
    const res = await deps.client.request<unknown>(
      buildQuoteRequest({
        binanceChainId: rep.binanceChainId,
        amount,
        fromTokenAddress: deps.spendTokenAddress,
        toTokenAddress: rep.tokenContractAddress,
        userWalletAddress: deps.probeWalletAddress,
      }),
    );
    recordCode(String(res.envelope.code));
    const routes = quoteDataSchema.parse(res.data);
    const best = routes.find((r) => r.isBest === true) ?? routes[0];
    if (best === undefined) {
      observation.error = "re-quote returned zero routes";
      return observation;
    }
    observation.requoted = true;
    observation.firstToTokenAmount = firstToTokenAmount;
    observation.requotedToTokenAmount = best.toTokenAmount;
    const first = tryParseDecimal(firstToTokenAmount);
    const second = tryParseDecimal(best.toTokenAmount);
    if (first !== undefined && second !== undefined) {
      const drift = bpsDifference(second, first);
      if (drift !== undefined) observation.driftBps = drift.toString();
    }
  } catch (err) {
    observation.error = `re-quote failed: ${describeError(err)}`;
  }

  return observation;
}

function countSimulate(
  byLeg: Record<string, { attempted: number; returned: number; succeeded: number }>,
  attempt: SimulateAttempt,
): void {
  const entry = byLeg[attempt.leg] ?? { attempted: 0, returned: 0, succeeded: 0 };
  entry.attempted += 1;
  if (attempt.returned) entry.returned += 1;
  if (attempt.status !== undefined && isNonFailingStatus(attempt.status)) entry.succeeded += 1;
  byLeg[attempt.leg] = entry;
}

function mergeUnknown(
  target: Record<string, string[]>,
  key: string,
  keys: readonly string[],
): void {
  const merged = new Set([...(target[key] ?? []), ...keys]);
  target[key] = [...merged].sort();
}

function emptyReport(
  probeRunId: string,
  deps: RunQuoteProbeDeps,
  generatedAt: Date,
  status: TerminalStatus,
  incompleteReasons: string[],
): QuoteFeasibilityReport {
  return {
    probeRunId,
    gitSha: deps.gitSha,
    generatedAt: generatedAt.toISOString(),
    sampling: {
      seed: deps.seed,
      singleRepPerPlatform: deps.singleRepPerPlatform ?? 10,
      multiRepresentationTickerCount: 0,
      multiRepresentationTickers: [],
      multiRepresentationCount: 0,
      singleRepresentationCount: 0,
      totalRepresentations: 0,
      shortfalls: [],
      universeRepresentations: 0,
      universeUnderlyings: 0,
    },
    probeConfig: {
      userWalletAddress: deps.probeWalletAddress,
      spendTokenAddress: deps.spendTokenAddress,
      spendTokenDecimals: deps.spendTokenDecimals,
      spendTokenDecimalsConfirmedLive: false,
      spendSizesUsd: [...(deps.spendSizesUsd ?? DEFAULT_SPEND_SIZES_USD)],
      slippagePercent: deps.slippagePercent ?? DEFAULT_SLIPPAGE_PERCENT,
    },
    results: [],
    ttlObservations: [],
    aggregate: {
      representationsAttempted: 0,
      representationsQuoted: 0,
      quoteAttempts: 0,
      quoteAttemptsSucceeded: 0,
      executionModeBreakdown: {},
      vendorBreakdown: {},
      undocumentedVendors: [],
      undocumentedExecutionModes: [],
      swapAttempts: 0,
      swapTxPayloads: 0,
      swapRfqPayloads: 0,
      simulateAttempts: 0,
      simulateReturned: 0,
      simulateSucceeded: 0,
      simulateByLeg: {},
      providerCodeBreakdown: {},
    },
    unknownFields: {},
    status,
    incompleteReasons,
  };
}
