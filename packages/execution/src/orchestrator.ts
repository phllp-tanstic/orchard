import { randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { ASSET_TYPE_LABEL } from "@orchard/rwa";
import { applyEligibility, reasonForProviderCode } from "./eligibility.js";
import {
  deviationBps,
  effectivePricePerShare,
  normalizeShares,
  priceImpactPercentToBps,
  quoteAgeSeconds,
  ratioRejectionDetail,
  toSmallestUnit,
} from "./normalize.js";
import { ALGORITHM_VERSION, decidingStep, rankCandidates } from "./ranking.js";
import type {
  CandidateRoute,
  EligibilityPolicy,
  RejectionReason,
  RepresentationInput,
  RouteDecision,
} from "./types.js";
import { QUOTE_PROVIDER } from "./types.js";

/**
 * Orchestrator (F002 T4). Resolves representations, quotes each one, normalizes,
 * filters and ranks.
 *
 * Fail-closed per candidate: a provider error for one representation rejects
 * THAT candidate with its reason code, never the run (F002 section 4). The only
 * fatal condition is having no representations at all to consider, which is a
 * caller/resolution problem rather than a routing outcome.
 *
 * Read-only. Nothing here signs, builds a swap, submits an order or broadcasts.
 */

/** The quote a caller must supply per representation. Shaped after the live /quote route. */
export interface QuoteResult {
  /** Present on success. */
  route?: {
    quoteId: string;
    toTokenAmount: string;
    /** The provider's echoed toToken.decimal, preferred over the token list value. */
    toTokenDecimal?: string | undefined;
    tradeFee?: string | null | undefined;
    estimateGasFee?: string | null | undefined;
    priceImpactPercent?: string | null | undefined;
    executionMode?: string | undefined;
    vendorName?: string | undefined;
  };
  /** The instant this quote was observed. Per quote: freshness is not shared. */
  quotedAt: Date;
  /** evidence.provider_call.id for this quote, when the caller recorded one. */
  providerCallId?: string | undefined;
  /** Provider envelope code when the quote failed. */
  providerCode?: string | undefined;
  /** Free-text error when the failure was not a provider envelope code. */
  error?: string | undefined;
}

export interface QuoteFn {
  (representation: RepresentationInput, spendSmallestUnit: string): Promise<QuoteResult>;
}

export interface RunRequest {
  underlyingTicker: string;
  /** Spend in the spend asset's own units, decimal string, e.g. "100". */
  spendAmountDecimal: string;
  policy: EligibilityPolicy;
  targetChainId: string;
}

export interface RunDeps {
  /** Representations for the ticker, already resolved from RWA data. */
  resolveRepresentations(underlyingTicker: string): Promise<RepresentationInput[]>;
  quote: QuoteFn;
  now?: () => Date;
  /** Injected for deterministic ids in tests. */
  newId?: () => string;
  /**
   * Max quotes in flight. The client's own rate limiter is the real guard; this
   * only bounds how many we hand it at once (F002 T4: concurrent within the
   * rate limiter).
   */
  concurrency?: number;
}

export interface RunResult {
  intentId: string;
  request: RunRequest;
  spendAmountSmallestUnit: string;
  candidates: CandidateRoute[];
  ranked: CandidateRoute[];
  decision: RouteDecision;
}

const DEFAULT_CONCURRENCY = 4;

/** Runs `tasks` with at most `limit` in flight, preserving input order in the output. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return out;
}

function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * Builds one candidate from a representation and its quote outcome. Pure given
 * `decidedAt`: the same inputs always produce the same candidate.
 */
export function buildCandidate(args: {
  intentId: string;
  id: string;
  representation: RepresentationInput;
  spendAmountDecimal: string;
  spendSmallestUnit: string;
  quote: QuoteResult;
  decidedAt: Date;
}): CandidateRoute {
  const { intentId, id, representation, spendAmountDecimal, spendSmallestUnit, quote, decidedAt } =
    args;

  const base: CandidateRoute = {
    id,
    intentId,
    representationId: `${representation.binanceChainId}:${representation.tokenContractAddress}`,
    platformId: representation.platformId,
    underlyingTicker: representation.underlyingTicker,
    tokenSymbol: representation.tokenSymbol,
    tokenContractAddress: representation.tokenContractAddress,
    binanceChainId: representation.binanceChainId,
    assetType: representation.assetType,
    assetTypeLabel:
      representation.assetType === null ? "UNKNOWN" : ASSET_TYPE_LABEL[representation.assetType],
    tokenToShareRatio: representation.tokenToShareRatio,
    quoteProvider: QUOTE_PROVIDER,
    inputAmount: spendSmallestUnit,
    inputAmountDecimal: spendAmountDecimal,
    eligibility: "REJECTED",
    rejectionReasons: [],
    ...definedOnly({
      referencePrice: representation.perSharePrice,
      providerCallId: quote.providerCallId,
      quoteTimestamp: quote.quotedAt.toISOString(),
    }),
  };

  // Quote failure: record the provider's own reason and stop. No fabricated
  // numbers, no partial economics.
  if (quote.route === undefined) {
    const reasons: RejectionReason[] = [];
    if (quote.providerCode !== undefined) {
      reasons.push(reasonForProviderCode(quote.providerCode));
    } else if (quote.error !== undefined) {
      reasons.push({ code: "QUOTE_ERROR", detail: quote.error });
    }
    return { ...base, rejectionReasons: reasons };
  }

  const route = quote.route;
  const withQuote: CandidateRoute = {
    ...base,
    quoteId: route.quoteId,
    expectedOutputTokenAmount: route.toTokenAmount,
    quoteAgeSeconds: quoteAgeSeconds(quote.quotedAt, decidedAt),
    ...definedOnly({
      toTokenDecimals: route.toTokenDecimal ?? representation.decimals,
      tradeFee: route.tradeFee,
      estimateGasFee: route.estimateGasFee,
      executionMode: route.executionMode,
      vendorName: route.vendorName,
      priceImpactBps: priceImpactPercentToBps(route.priceImpactPercent)?.toFixed(),
    }),
  };

  // An unusable ratio cannot be normalized; eligibility reports INVALID_RATIO.
  if (ratioRejectionDetail(representation.tokenToShareRatio) !== undefined) return withQuote;

  let shares: Decimal;
  try {
    shares = normalizeShares({
      toTokenAmount: route.toTokenAmount,
      toTokenDecimals: withQuote.toTokenDecimals ?? representation.decimals,
      tokenToShareRatio: representation.tokenToShareRatio,
    });
  } catch (err) {
    return {
      ...withQuote,
      rejectionReasons: [
        {
          code: "QUOTE_ERROR",
          detail: `could not normalize the quote: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  const price = effectivePricePerShare(spendAmountDecimal, shares);
  const bench =
    representation.perSharePrice !== undefined && representation.perSharePrice !== ""
      ? new Decimal(representation.perSharePrice)
      : undefined;
  const deviation =
    price !== undefined && bench !== undefined ? deviationBps(price, bench) : undefined;

  return {
    ...withQuote,
    normalizedExpectedShares: shares.toFixed(),
    ...definedOnly({
      effectivePricePerShare: price?.toFixed(),
      referenceDeviationBps: deviation?.toFixed(),
    }),
  };
}

/**
 * run(ticker, spendAmount, policy). Quotes every representation concurrently,
 * normalizes, filters by policy and ranks deterministically.
 *
 * When nothing is eligible the decision is an explicit NO_ELIGIBLE_ROUTE
 * listing every rejection reason seen. Never a fallback price, never a silent
 * substitution (F002 T4).
 */
export async function runBestExecution(request: RunRequest, deps: RunDeps): Promise<RunResult> {
  const now = deps.now ?? ((): Date => new Date());
  const newId = deps.newId ?? ((): string => randomUUID());
  const intentId = newId();

  const spendSmallestUnit = toSmallestUnit(
    request.spendAmountDecimal,
    request.policy.spendAsset.decimals,
  );

  const representations = await deps.resolveRepresentations(request.underlyingTicker);
  if (representations.length === 0) {
    const decidedAt = now().toISOString();
    return {
      intentId,
      request,
      spendAmountSmallestUnit: spendSmallestUnit,
      candidates: [],
      ranked: [],
      decision: {
        intentId,
        selectedCandidateId: null,
        algorithmVersion: ALGORITHM_VERSION,
        rankedCandidateIds: [],
        reasonCodes: ["NO_REPRESENTATIONS"],
        decidedAt,
        outcome: "NO_ELIGIBLE_ROUTE",
      },
    };
  }

  // Each quote carries its OWN timestamp: freshness is per quote, not per run.
  const quotes = await mapWithConcurrency(
    representations,
    deps.concurrency ?? DEFAULT_CONCURRENCY,
    async (representation) => {
      try {
        return await deps.quote(representation, spendSmallestUnit);
      } catch (err) {
        // A thrown quote is still just one rejected candidate.
        return {
          quotedAt: now(),
          error: err instanceof Error ? err.message : String(err),
        } satisfies QuoteResult;
      }
    },
  );

  // One decision instant for every candidate, so ages are comparable.
  const decidedAtDate = now();
  const candidates = representations.map((representation, i) =>
    applyEligibility(
      buildCandidate({
        intentId,
        id: newId(),
        representation,
        spendAmountDecimal: request.spendAmountDecimal,
        spendSmallestUnit,
        quote: quotes[i]!,
        decidedAt: decidedAtDate,
      }),
      { targetChainId: request.targetChainId, policy: request.policy },
    ),
  );

  const ranked = rankCandidates(candidates);
  const decidedAt = decidedAtDate.toISOString();

  if (ranked.length === 0) {
    const seen = new Set<string>();
    for (const c of candidates) for (const r of c.rejectionReasons) seen.add(r.code);
    return {
      intentId,
      request,
      spendAmountSmallestUnit: spendSmallestUnit,
      candidates,
      ranked,
      decision: {
        intentId,
        selectedCandidateId: null,
        algorithmVersion: ALGORITHM_VERSION,
        rankedCandidateIds: [],
        reasonCodes: [...seen].sort(),
        decidedAt,
        outcome: "NO_ELIGIBLE_ROUTE",
      },
    };
  }

  const step = decidingStep(ranked);
  return {
    intentId,
    request,
    spendAmountSmallestUnit: spendSmallestUnit,
    candidates,
    ranked,
    decision: {
      intentId,
      selectedCandidateId: ranked[0]!.id,
      algorithmVersion: ALGORITHM_VERSION,
      rankedCandidateIds: ranked.map((c) => c.id),
      reasonCodes: step === undefined ? ["SOLE_ELIGIBLE_CANDIDATE"] : [step],
      decidedAt,
      outcome: "SELECTED",
    },
  };
}
