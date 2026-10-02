import { Decimal } from "decimal.js";
import { ASSET_TYPE_LABEL, type AssetType } from "@orchard/rwa";
import { ratioRejectionDetail } from "./normalize.js";
import type { CandidateRoute, EligibilityPolicy, RejectionReason, SpendAsset } from "./types.js";

/**
 * Eligibility policy and filter (F002 T2).
 *
 * Everything here is configuration-driven. No ticker, address, vendor,
 * execution mode or asset type is a literal in a decision path. The policy is
 * an argument; the defaults below are the owner's decisions, stated once, with
 * the evidence that justifies them.
 */

/**
 * Provider envelope codes that mean a specific, named rejection rather than a
 * generic quote error. Reference data, not a branch on an assumed value: any
 * code not listed falls through to QUOTE_ERROR carrying the code verbatim.
 *
 * 40367 and 40374 are both UNDOCUMENTED by the provider and were established
 * live (F001-B): 40367 is market-hours dependent, 40374 is thin liquidity at
 * the requested size.
 */
export const PROVIDER_CODE_REASONS: Readonly<
  Record<string, "NON_TRADING_SESSION" | "UNSUPPORTED_TOKEN">
> = {
  "40367": "NON_TRADING_SESSION",
  "40374": "UNSUPPORTED_TOKEN",
};

/** DEC-005: Stock (1) and ETF (3). Pre-IPO (2) is out of scope. */
export const DEFAULT_ALLOWED_ASSET_TYPES: readonly AssetType[] = [1, 3];

/** USDT on BSC, 18 decimals - the decimals confirmed from the provider's own echo. */
export const USDT_BSC: SpendAsset = {
  symbol: "USDT",
  tokenContractAddress: "0x55d398326f99059fF775485246999027B3197955",
  decimals: 18,
};

/**
 * DEC-036: maxQuoteAgeSeconds is 20, against a MEASURED quote expiry of about
 * 30s - a quoteId reused after 35s returned 40401 (F001-B). 20 leaves headroom
 * to act on a quote before the provider expires it.
 */
export const DEFAULT_MAX_QUOTE_AGE_SECONDS = 20;

/**
 * Default price-impact ceiling, 300 bps.
 *
 * This is now backed by evidence rather than being a bare product guess.
 * Healthy live routes reported 0 or about 107 bps, while four routes in the
 * 40-ticker batch (probe_run 18ba4538-7c58-4940-8e45-1eae44a7646b) reported
 * 93% to 99.96% impact - 9319, 9610, 9990 and 9996 bps once the provider
 * fraction is converted correctly. A 300 bps ceiling sits far above every
 * healthy observation and far below every broken one, and in that run it
 * rejected exactly the broken routes and nothing else.
 *
 * The specific number 300 is still a product choice, not a provider limit.
 */
export const DEFAULT_MAX_PRICE_IMPACT_BPS = "300";

/**
 * DEC-037 default reference-deviation ceiling, 300 bps, applied in both
 * directions. A product default, not a measured provider limit. The evidence
 * that informs it: across the 40-ticker batch
 * (probe_run eace2297-c3a1-44d7-bf60-14a279f3ebef) the worst ELIGIBLE
 * candidate was 91.3 bps from its per-share benchmark (median 18.1), and the
 * two platforms agreed on the benchmark itself to within 49.6 bps.
 *
 * A later run of the same 40 tickers
 * (probe_run 5dc1bdae-36fc-4c7b-b91e-0b5d863202e7) showed a worst ELIGIBLE
 * deviation of 220.6 bps (median 13.8), so the headroom is about 1.4x rather
 * than the 3x the first run suggested. Healthy deviation moves with the market,
 * and 300 bps has less margin than one run implied. It still separated every
 * healthy candidate from every broken one in both runs, but this is the number
 * to revisit first if a legitimate route is ever rejected.
 */
export const DEFAULT_MAX_REFERENCE_DEVIATION_BPS = "300";

export function defaultPolicy(overrides: Partial<EligibilityPolicy> = {}): EligibilityPolicy {
  return {
    maxPriceImpactBps: DEFAULT_MAX_PRICE_IMPACT_BPS,
    maxReferenceDeviationBps: DEFAULT_MAX_REFERENCE_DEVIATION_BPS,
    maxQuoteAgeSeconds: DEFAULT_MAX_QUOTE_AGE_SECONDS,
    allowedAssetTypes: DEFAULT_ALLOWED_ASSET_TYPES,
    spendAsset: USDT_BSC,
    ...overrides,
  };
}

/** Maps a provider envelope code to its named reason, or QUOTE_ERROR. */
export function reasonForProviderCode(providerCode: string): RejectionReason {
  const named = PROVIDER_CODE_REASONS[providerCode];
  if (named === "NON_TRADING_SESSION") {
    return {
      code: "NON_TRADING_SESSION",
      providerCode,
      detail: "provider reported the underlying is outside its trading session",
    };
  }
  if (named === "UNSUPPORTED_TOKEN") {
    return {
      code: "UNSUPPORTED_TOKEN",
      providerCode,
      detail: "provider reported insufficient liquidity to quote at this size",
    };
  }
  return {
    code: "QUOTE_ERROR",
    providerCode,
    detail: `provider rejected the quote (${providerCode})`,
  };
}

export interface EligibilityInput {
  /** The chain this run targets. A representation on any other chain is WRONG_CHAIN. */
  targetChainId: string;
  policy: EligibilityPolicy;
}

/**
 * Evaluates one candidate against the policy and returns EVERY reason it fails,
 * not just the first. A caller that needs the first can read `[0]`; a report
 * that needs the whole picture has it.
 *
 * Pure: no clock, no IO. `quoteAgeSeconds` is already computed on the candidate
 * so the decision instant is the orchestrator's single `now`, not a fresh one
 * per candidate.
 */
export function evaluateEligibility(
  candidate: CandidateRoute,
  input: EligibilityInput,
): RejectionReason[] {
  const reasons: RejectionReason[] = [];
  const { policy, targetChainId } = input;

  // Identity first: a candidate that cannot be typed cannot be judged (DEC-020).
  if (candidate.assetType === null) {
    reasons.push({
      code: "NULL_IDENTITY",
      detail: "assetType or underlyingName is null, so the token cannot be typed or grouped",
    });
  } else if (!policy.allowedAssetTypes.includes(candidate.assetType)) {
    reasons.push({
      code: "ASSET_TYPE_EXCLUDED",
      detail: `assetType ${candidate.assetType} (${ASSET_TYPE_LABEL[candidate.assetType]}) is not in the allowed set [${policy.allowedAssetTypes
        .map((t) => `${t} (${ASSET_TYPE_LABEL[t]})`)
        .join(", ")}]`,
    });
  }

  if (candidate.binanceChainId !== targetChainId) {
    reasons.push({
      code: "WRONG_CHAIN",
      detail: `representation is on chain ${candidate.binanceChainId}, run targets ${targetChainId}`,
    });
  }

  const ratioProblem = ratioRejectionDetail(candidate.tokenToShareRatio);
  if (ratioProblem !== undefined) {
    reasons.push({ code: "INVALID_RATIO", detail: ratioProblem });
  }

  // Pre-existing provider rejections are carried through untouched.
  for (const existing of candidate.rejectionReasons) {
    if (
      !reasons.some((r) => r.code === existing.code && r.providerCode === existing.providerCode)
    ) {
      reasons.push(existing);
    }
  }

  // A candidate with no quote cannot be ranked. Only add UNSUPPORTED_TOKEN when
  // the provider has not already told us why, so we never double-report.
  const hasQuote =
    candidate.expectedOutputTokenAmount !== undefined &&
    candidate.normalizedExpectedShares !== undefined;
  if (!hasQuote) {
    const alreadyExplained = reasons.some(
      (r) =>
        r.code === "QUOTE_ERROR" ||
        r.code === "NON_TRADING_SESSION" ||
        r.code === "UNSUPPORTED_TOKEN",
    );
    if (!alreadyExplained) {
      reasons.push({
        code: "UNSUPPORTED_TOKEN",
        detail: "provider returned no route for this token",
      });
    }
  }

  if (
    candidate.quoteAgeSeconds !== undefined &&
    candidate.quoteAgeSeconds > policy.maxQuoteAgeSeconds
  ) {
    reasons.push({
      code: "QUOTE_STALE",
      detail: `quote is ${candidate.quoteAgeSeconds}s old, limit is ${policy.maxQuoteAgeSeconds}s`,
    });
  }

  if (candidate.priceImpactBps !== undefined) {
    const impact = new Decimal(candidate.priceImpactBps);
    const max = new Decimal(policy.maxPriceImpactBps);
    // Compare magnitude: a negative impact is favourable, never a rejection.
    if (impact.greaterThan(max)) {
      reasons.push({
        code: "PRICE_IMPACT_EXCEEDS_MAX",
        detail: `priceImpact ${candidate.priceImpactBps} bps exceeds ${policy.maxPriceImpactBps} bps`,
      });
    }
  }

  // DEC-037: deviation from the /rwa/price per-share benchmark, in BOTH
  // directions. Only applies when the candidate actually priced - a candidate
  // with no quote is already rejected above and has nothing to compare.
  if (candidate.referenceDeviationBps !== undefined) {
    const deviation = new Decimal(candidate.referenceDeviationBps);
    const max = new Decimal(policy.maxReferenceDeviationBps);
    // Strictly greater, so a deviation exactly at the ceiling is allowed and
    // the limit reads as inclusive rather than being off by one.
    if (deviation.greaterThan(max)) {
      reasons.push({
        code: "REFERENCE_PREMIUM_EXCEEDS_MAX",
        detail:
          "implied per-share price is " +
          deviation.toFixed(1) +
          " bps ABOVE the /rwa/price benchmark, over the " +
          policy.maxReferenceDeviationBps +
          " bps limit",
      });
    } else if (deviation.negated().greaterThan(max)) {
      reasons.push({
        code: "REFERENCE_DISCOUNT_SUSPECT",
        detail:
          "implied per-share price is " +
          deviation.negated().toFixed(1) +
          " bps BELOW the /rwa/price benchmark, over the " +
          policy.maxReferenceDeviationBps +
          " bps limit; a discount that large is treated as a broken or stale quote, not a bargain",
      });
    }
  }

  return reasons;
}

/**
 * Applies the verdict to a candidate, returning a new object. Never mutates.
 *
 * Also sets the DEC-037 `referenceUnavailable` flag: a candidate that priced
 * but had no benchmark to check against stays ELIGIBLE, and the report shows
 * that the check could not run rather than letting a missing benchmark read as
 * a perfect zero deviation.
 */
export function applyEligibility(
  candidate: CandidateRoute,
  input: EligibilityInput,
): CandidateRoute {
  const rejectionReasons = evaluateEligibility(candidate, input);
  const priced = candidate.effectivePricePerShare !== undefined;
  const referenceUnavailable = priced && candidate.referenceDeviationBps === undefined;
  return {
    ...candidate,
    eligibility: rejectionReasons.length === 0 ? "ELIGIBLE" : "REJECTED",
    rejectionReasons,
    ...(referenceUnavailable ? { referenceUnavailable: true } : {}),
  };
}
