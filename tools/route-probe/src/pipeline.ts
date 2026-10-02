import { Decimal } from "decimal.js";
import {
  ALGORITHM_VERSION,
  deviationBps,
  runBestExecution,
  type CandidateRoute,
  type EligibilityPolicy,
  type QuoteResult,
  type RepresentationInput,
} from "@orchard/execution";
import type { PlatformComparison, RouteProbeReport, TickerResult } from "./report.js";

/**
 * `pnpm route:probe` pipeline (F002 T5). Pure given its dependencies: the
 * provider seam is `quote`, representation discovery is `resolveAll`, and
 * persistence is optional, so the whole pipeline is unit-testable offline.
 */

export interface RouteProbeDeps {
  /** Every representation on the target chain, already resolved from RWA data. */
  resolveAll(): Promise<RepresentationInput[]>;
  quote(representation: RepresentationInput, spendSmallestUnit: string): Promise<QuoteResult>;
  /** Persists one ticker result; returns the execution_request id. Optional. */
  persist?(result: TickerResult): Promise<string>;
  now?: () => Date;
  newId?: () => string;
  concurrency?: number;
}

export interface RouteProbeRequest {
  /** Explicit tickers, or undefined to run the multi-representation batch. */
  tickers?: string[];
  spendAmountDecimal: string;
  policy: EligibilityPolicy;
  targetChainId: string;
  probeWalletAddress: string;
  gitSha: string;
  probeRunId: string;
}

/** Tickers with more than one representation on the target chain, sorted. */
export function multiRepresentationTickersOf(
  representations: readonly RepresentationInput[],
): string[] {
  const byTicker = new Map<string, Set<string>>();
  for (const r of representations) {
    const set = byTicker.get(r.underlyingTicker) ?? new Set<string>();
    set.add(`${r.binanceChainId}:${r.tokenContractAddress}`);
    byTicker.set(r.underlyingTicker, set);
  }
  return [...byTicker.entries()]
    .filter(([, reps]) => reps.size > 1)
    .map(([ticker]) => ticker)
    .sort();
}

/** Best eligible candidate per platform, by normalized shares. */
function bestPerPlatform(candidates: readonly CandidateRoute[]): Map<string, CandidateRoute> {
  const out = new Map<string, CandidateRoute>();
  for (const c of candidates) {
    if (c.eligibility !== "ELIGIBLE" || c.normalizedExpectedShares === undefined) continue;
    const incumbent = out.get(c.platformId);
    if (
      incumbent === undefined ||
      new Decimal(c.normalizedExpectedShares).greaterThan(
        new Decimal(incumbent.normalizedExpectedShares ?? "0"),
      )
    ) {
      out.set(c.platformId, c);
    }
  }
  return out;
}

export function comparePlatforms(result: TickerResult): PlatformComparison {
  const eligibleByPlatform: Record<string, number> = {};
  for (const c of result.candidates) {
    if (c.eligibility !== "ELIGIBLE") continue;
    eligibleByPlatform[c.platformId] = (eligibleByPlatform[c.platformId] ?? 0) + 1;
  }
  const eligibleCount = Object.values(eligibleByPlatform).reduce((a, b) => a + b, 0);
  const winner = result.candidates.find((c) => c.id === result.decision.selectedCandidateId);

  const best = bestPerPlatform(result.candidates);
  const platforms = [...best.keys()].sort();

  const comparison: PlatformComparison = {
    underlyingTicker: result.underlyingTicker,
    eligibleByPlatform,
    fewerThanTwoEligible: eligibleCount < 2,
    ...(winner !== undefined ? { winnerPlatformId: winner.platformId } : {}),
  };

  // Spread and benchmark agreement need exactly two platforms to compare.
  if (platforms.length === 2) {
    const a = best.get(platforms[0]!)!;
    const b = best.get(platforms[1]!)!;
    const winnerSide = winner !== undefined && winner.platformId === platforms[1] ? b : a;
    const otherSide = winnerSide === a ? b : a;
    const spread = deviationBps(
      new Decimal(winnerSide.normalizedExpectedShares ?? "0"),
      new Decimal(otherSide.normalizedExpectedShares ?? "0"),
    );
    if (spread !== undefined) comparison.normalizedSharesSpreadBps = spread.toFixed(1);

    // Amendment A1 carried risk: measure, never assume, that the two platforms
    // use the same per-share unit for the same underlying.
    if (a.referencePrice !== undefined && b.referencePrice !== undefined) {
      const agree = deviationBps(new Decimal(a.referencePrice), new Decimal(b.referencePrice));
      if (agree !== undefined) comparison.perShareBenchmarkAgreementBps = agree.toFixed(1);
    }
  }

  return comparison;
}

export async function runRouteProbe(
  request: RouteProbeRequest,
  deps: RouteProbeDeps,
): Promise<RouteProbeReport> {
  const now = deps.now ?? ((): Date => new Date());
  const reasons: string[] = [];

  let all: RepresentationInput[];
  try {
    all = await deps.resolveAll();
  } catch (err) {
    const reason = `failed to resolve representations: ${err instanceof Error ? err.message : String(err)}`;
    return {
      probeRunId: request.probeRunId,
      gitSha: request.gitSha,
      generatedAt: now().toISOString(),
      mode: request.tickers === undefined ? "batch" : "single",
      targetChainId: request.targetChainId,
      algorithmVersion: ALGORITHM_VERSION,
      policy: request.policy,
      probeWalletAddress: request.probeWalletAddress,
      results: [],
      status: "FAILED",
      incompleteReasons: [reason],
    };
  }

  const onChain = all.filter((r) => r.binanceChainId === request.targetChainId);
  // Bind once so the type narrows: absent tickers means batch mode over every
  // multi-representation ticker.
  const explicitTickers = request.tickers;
  const batch = explicitTickers === undefined;
  const tickers: string[] = explicitTickers ?? multiRepresentationTickersOf(onChain);
  const mode: "single" | "batch" = batch ? "batch" : "single";

  const byTicker = new Map<string, RepresentationInput[]>();
  for (const r of onChain) {
    const list = byTicker.get(r.underlyingTicker) ?? [];
    list.push(r);
    byTicker.set(r.underlyingTicker, list);
  }

  const results: TickerResult[] = [];
  for (const ticker of tickers) {
    const reps = byTicker.get(ticker) ?? [];
    if (reps.length === 0) {
      reasons.push(`ticker ${ticker} has no representation on chain ${request.targetChainId}`);
    }
    // Deterministic order so a run is reproducible.
    reps.sort((a, b) =>
      `${a.platformId}:${a.tokenContractAddress}`.localeCompare(
        `${b.platformId}:${b.tokenContractAddress}`,
      ),
    );

    const run = await runBestExecution(
      {
        underlyingTicker: ticker,
        spendAmountDecimal: request.spendAmountDecimal,
        policy: request.policy,
        targetChainId: request.targetChainId,
      },
      {
        resolveRepresentations: () => Promise.resolve(reps),
        quote: deps.quote,
        ...(deps.now !== undefined ? { now: deps.now } : {}),
        ...(deps.newId !== undefined ? { newId: deps.newId } : {}),
        ...(deps.concurrency !== undefined ? { concurrency: deps.concurrency } : {}),
      },
    );

    const result: TickerResult = {
      underlyingTicker: ticker,
      spendAmountDecimal: request.spendAmountDecimal,
      spendAmountSmallestUnit: run.spendAmountSmallestUnit,
      candidates: run.candidates,
      decision: run.decision,
      rankedCandidateIds: run.decision.rankedCandidateIds,
    };

    if (deps.persist !== undefined) {
      try {
        result.executionRequestId = await deps.persist(result);
      } catch (err) {
        reasons.push(
          `failed to persist ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (run.decision.outcome === "NO_ELIGIBLE_ROUTE") {
      reasons.push(
        `no eligible route for ${ticker}: ${run.decision.reasonCodes.join(", ") || "no reasons recorded"}`,
      );
    }
    results.push(result);
  }

  const report: RouteProbeReport = {
    probeRunId: request.probeRunId,
    gitSha: request.gitSha,
    generatedAt: now().toISOString(),
    mode,
    targetChainId: request.targetChainId,
    algorithmVersion: ALGORITHM_VERSION,
    policy: request.policy,
    probeWalletAddress: request.probeWalletAddress,
    results,
    status: reasons.length === 0 ? "COMPLETE" : "INCOMPLETE",
    incompleteReasons: reasons,
  };

  if (batch) {
    const winsByPlatform: Record<string, number> = {};
    const rejectionCodeCounts: Record<string, number> = {};
    const executionModeCounts: Record<string, number> = {};
    const vendorCounts: Record<string, number> = {};
    const comparisons: PlatformComparison[] = [];
    let selected = 0;
    let noRoute = 0;
    let fewerThanTwo = 0;
    let referenceUnavailableCount = 0;

    for (const r of results) {
      if (r.decision.outcome === "SELECTED") {
        selected += 1;
        const winner = r.candidates.find((c) => c.id === r.decision.selectedCandidateId);
        if (winner !== undefined) {
          winsByPlatform[winner.platformId] = (winsByPlatform[winner.platformId] ?? 0) + 1;
        }
      } else {
        noRoute += 1;
      }
      for (const c of r.candidates) {
        for (const reason of c.rejectionReasons) {
          rejectionCodeCounts[reason.code] = (rejectionCodeCounts[reason.code] ?? 0) + 1;
        }
        if (c.executionMode !== undefined) {
          executionModeCounts[c.executionMode] = (executionModeCounts[c.executionMode] ?? 0) + 1;
        }
        if (c.vendorName !== undefined) {
          vendorCounts[c.vendorName] = (vendorCounts[c.vendorName] ?? 0) + 1;
        }
        if (c.eligibility === "ELIGIBLE" && c.referenceUnavailable === true) {
          referenceUnavailableCount += 1;
        }
      }
      const comparison = comparePlatforms(r);
      if (comparison.fewerThanTwoEligible) fewerThanTwo += 1;
      comparisons.push(comparison);
    }

    report.batchSummary = {
      tickersRequested: tickers.length,
      tickersWithADecision: results.length,
      tickersSelected: selected,
      tickersNoEligibleRoute: noRoute,
      winsByPlatform,
      tickersWithFewerThanTwoEligible: fewerThanTwo,
      rejectionCodeCounts,
      referenceUnavailableCount,
      executionModeCounts,
      vendorCounts,
      comparisons,
    };
  }

  return report;
}
