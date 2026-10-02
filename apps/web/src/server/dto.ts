import type { CandidateRoute, RejectionReasonCode, RouteDecision } from "@orchard/execution";

/**
 * UI-safe DTOs (F003 T2). Nothing in here carries a secret, a signing payload
 * or a raw provider credential - and no such payload exists in this feature at
 * all, because nothing calls /swap.
 *
 * Every rejection code is mapped to plain language AND the raw code is
 * retained, so the drawer can be honest with a non-technical reader without
 * hiding what the engine actually decided.
 */

/** Plain-language text for every reason code the engine can emit. */
export const REASON_TEXT: Readonly<Record<RejectionReasonCode, string>> = {
  QUOTE_ERROR: "The provider could not price this route just now.",
  NON_TRADING_SESSION: "This company is outside its trading session right now.",
  INVALID_RATIO: "This token reports an unusable share ratio, so it cannot be compared.",
  WRONG_CHAIN: "This token is not on the chain this app supports.",
  UNSUPPORTED_TOKEN: "There was not enough liquidity to price this route at this amount.",
  QUOTE_STALE: "The quote for this route expired before it could be compared.",
  PRICE_IMPACT_EXCEEDS_MAX: "This route would move the price too far for the amount entered.",
  NULL_IDENTITY: "This token is missing identity details, so it cannot be compared.",
  ASSET_TYPE_EXCLUDED: "This asset type is outside what Orchard supports today.",
  REFERENCE_PREMIUM_EXCEEDS_MAX:
    "This route is priced well above the reference price, so it was not used.",
  REFERENCE_DISCOUNT_SUSPECT:
    "This route is priced well below the reference price, which usually means a broken quote rather than a bargain.",
};

/** Codes the decision emits that are not rejections. Kept separate and explicit. */
export const DECISION_REASON_TEXT: Readonly<Record<string, string>> = {
  NORMALIZED_SHARES_DESC: "It returned the most shares for your amount.",
  EXPLICIT_FEES_ASC: "It had the lower disclosed fees at equal shares.",
  QUOTE_FRESHNESS_ASC: "Its quote was fresher at equal shares and fees.",
  PRICE_IMPACT_ASC: "It moved the price least at equal shares, fees and freshness.",
  TOKEN_ADDRESS_LEXICOGRAPHIC: "The routes were identical, so a fixed tie-break chose one.",
  SOLE_ELIGIBLE_CANDIDATE: "It was the only route that met every check.",
  NO_REPRESENTATIONS: "No supported token was found for this company.",
};

export function reasonText(code: string): string {
  return (
    (REASON_TEXT as Record<string, string | undefined>)[code] ??
    DECISION_REASON_TEXT[code] ??
    // An unmapped code must still surface. Showing the raw code is honest;
    // inventing a sentence for it would not be.
    `The engine reported ${code}.`
  );
}

export interface CandidateDto {
  /** Platform name, shown only in the "Why this route?" drawer (F003 T4). */
  platform: string;
  tokenSymbol: string;
  assetTypeLabel: string;
  accepted: boolean;
  /** Exact provider/engine decimal strings. The UI formats, it never recomputes. */
  estimatedShares?: string | undefined;
  estimatedPricePerShare?: string | undefined;
  referencePrice?: string | undefined;
  deviationBps?: string | undefined;
  priceImpactBps?: string | undefined;
  tradeFee?: string | undefined;
  networkFee?: string | undefined;
  quoteAgeSeconds?: number | undefined;
  /** True when no per-share benchmark existed, so that check could not run (DEC-037). */
  referenceUnavailable: boolean;
  /** Plain language, one per reason. */
  reasons: string[];
  /** The raw codes, retained alongside the plain language. */
  reasonCodes: string[];
  /** Provider codes where the provider was the reason. */
  providerCodes: string[];
}

export type PreviewOutcome = "SELECTED" | "NO_ELIGIBLE_ROUTE";

export interface PreviewDto {
  ticker: string;
  companyName: string;
  assetTypeLabel: string;
  amount: string;
  spendAssetSymbol: string;
  outcome: PreviewOutcome;
  /** Present only when outcome is SELECTED. Never a fallback or a guess. */
  winner?:
    | {
        platform: string;
        tokenSymbol: string;
        estimatedShares: string;
        estimatedPricePerShare: string;
        tradeFee?: string | undefined;
        networkFee?: string | undefined;
      }
    | undefined;
  /** Why this outcome, in plain language, with the raw codes retained. */
  decisionReasons: string[];
  decisionReasonCodes: string[];
  algorithmVersion: string;
  /** Oldest quote in the comparison, and when the whole preview goes stale. */
  quotedAt?: string | undefined;
  expiresAt?: string | undefined;
  maxQuoteAgeSeconds: number;
  candidates: CandidateDto[];
  /** execution_request id, so a reader can reconcile the screen with the database. */
  executionRequestId?: string | undefined;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value.trim() === "" ? undefined : value;
}

export function toCandidateDto(c: CandidateRoute): CandidateDto {
  return {
    platform: c.platformId,
    tokenSymbol: c.tokenSymbol,
    assetTypeLabel: c.assetTypeLabel,
    accepted: c.eligibility === "ELIGIBLE",
    estimatedShares: nonEmpty(c.normalizedExpectedShares),
    estimatedPricePerShare: nonEmpty(c.effectivePricePerShare),
    referencePrice: nonEmpty(c.referencePrice),
    deviationBps: nonEmpty(c.referenceDeviationBps),
    priceImpactBps: nonEmpty(c.priceImpactBps),
    tradeFee: nonEmpty(c.tradeFee),
    networkFee: nonEmpty(c.estimateGasFee),
    quoteAgeSeconds: c.quoteAgeSeconds,
    referenceUnavailable: c.referenceUnavailable === true,
    reasons: c.rejectionReasons.map((r) => reasonText(r.code)),
    reasonCodes: c.rejectionReasons.map((r) => r.code),
    providerCodes: c.rejectionReasons
      .map((r) => r.providerCode)
      .filter((p): p is string => p !== undefined),
  };
}

export interface BuildPreviewDtoArgs {
  ticker: string;
  companyName: string;
  assetTypeLabel: string;
  amount: string;
  spendAssetSymbol: string;
  maxQuoteAgeSeconds: number;
  candidates: readonly CandidateRoute[];
  decision: RouteDecision;
  executionRequestId?: string | undefined;
}

/**
 * Builds the UI DTO. `expiresAt` is derived from the OLDEST quote in the
 * comparison, not the newest: the preview as a whole is only as fresh as its
 * weakest leg, and showing the newest would overstate how long it is good for.
 */
export function buildPreviewDto(args: BuildPreviewDtoArgs): PreviewDto {
  const winnerCandidate = args.candidates.find((c) => c.id === args.decision.selectedCandidateId);
  const quoteTimes = args.candidates
    .map((c) => c.quoteTimestamp)
    .filter((t): t is string => t !== undefined)
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t));
  const oldest = quoteTimes.length > 0 ? Math.min(...quoteTimes) : undefined;

  const dto: PreviewDto = {
    ticker: args.ticker,
    companyName: args.companyName,
    assetTypeLabel: args.assetTypeLabel,
    amount: args.amount,
    spendAssetSymbol: args.spendAssetSymbol,
    outcome: args.decision.outcome,
    decisionReasons: args.decision.reasonCodes.map(reasonText),
    decisionReasonCodes: [...args.decision.reasonCodes],
    algorithmVersion: args.decision.algorithmVersion,
    maxQuoteAgeSeconds: args.maxQuoteAgeSeconds,
    candidates: args.candidates.map(toCandidateDto),
    ...(args.executionRequestId !== undefined
      ? { executionRequestId: args.executionRequestId }
      : {}),
    ...(oldest !== undefined
      ? {
          quotedAt: new Date(oldest).toISOString(),
          expiresAt: new Date(oldest + args.maxQuoteAgeSeconds * 1000).toISOString(),
        }
      : {}),
  };

  if (
    args.decision.outcome === "SELECTED" &&
    winnerCandidate !== undefined &&
    winnerCandidate.normalizedExpectedShares !== undefined &&
    winnerCandidate.effectivePricePerShare !== undefined
  ) {
    dto.winner = {
      platform: winnerCandidate.platformId,
      tokenSymbol: winnerCandidate.tokenSymbol,
      estimatedShares: winnerCandidate.normalizedExpectedShares,
      estimatedPricePerShare: winnerCandidate.effectivePricePerShare,
      tradeFee: nonEmpty(winnerCandidate.tradeFee),
      networkFee: nonEmpty(winnerCandidate.estimateGasFee),
    };
  }
  return dto;
}
