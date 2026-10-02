import type { AssetType } from "@orchard/rwa";

/**
 * Domain types for the deterministic best-execution engine (F002 T1), shaped
 * after `docs/ORCHARD_PRODUCTION_BLUEPRINT.md` sections 6.5 (CandidateRoute)
 * and 6.6 (RouteDecision).
 *
 * Every money, price, ratio and share quantity is an EXACT decimal string -
 * either the provider's own bytes or a decimal.js result serialized without
 * loss. No `number` is used for any of them anywhere in this package. The only
 * numeric fields are counts and whole seconds, where a float cannot lose money.
 */

/** The one quote provider this engine supports today. Never inferred. */
export const QUOTE_PROVIDER = "BINANCE_WEB3" as const;
export type QuoteProvider = typeof QUOTE_PROVIDER;

/**
 * Stable rejection reason codes (F002 T2). Stable means: once a code is here,
 * its meaning does not change, because reports and persisted rows carry it.
 */
export const REJECTION_REASON_CODES = [
  /** The provider refused to quote. Always carries the provider's own code. */
  "QUOTE_ERROR",
  /** Provider code 40367: the underlying is outside its trading session. */
  "NON_TRADING_SESSION",
  /** tokenToShareRatio is empty, non-numeric, zero or negative - never usable. */
  "INVALID_RATIO",
  /** Representation is not on the chain this run targets. */
  "WRONG_CHAIN",
  /** Provider returned no route for this token at this size. */
  "UNSUPPORTED_TOKEN",
  /** Quote older than the policy's maxQuoteAgeSeconds. */
  "QUOTE_STALE",
  /** priceImpact above the policy's maxPriceImpactBps. */
  "PRICE_IMPACT_EXCEEDS_MAX",
  /** DEC-020: null assetType or underlyingName, so it cannot be typed or grouped. */
  "NULL_IDENTITY",
  /** assetType not in the policy's allowedAssetTypes (DEC-005: Stock and ETF). */
  "ASSET_TYPE_EXCLUDED",
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

export interface RejectionReason {
  code: RejectionReasonCode;
  /** Human-readable specifics. Never a substitute for the code. */
  detail?: string;
  /**
   * The provider's envelope code, verbatim, when the provider is the reason.
   * Kept as a string because the provider sends it as a JSON number and the
   * docs present it as a string (DEC-030).
   */
  providerCode?: string;
}

/**
 * Eligibility policy (F002 T2). Configuration, never hardcoded: the engine
 * reads it, the caller supplies it, and the report records it.
 */
export interface EligibilityPolicy {
  /** Reject a candidate whose priceImpact exceeds this, in basis points. */
  maxPriceImpactBps: string;
  /**
   * Reject a quote older than this. DEC-036 sets the default to 20s against a
   * MEASURED expiry of about 30s: a quoteId reused after 35s returned 40401
   * (F001-B). 20 leaves headroom to act on a quote before it expires.
   */
  maxQuoteAgeSeconds: number;
  /**
   * Asset types that may be quoted at all. DEC-005 default is Stock and ETF;
   * Pre-IPO is out of scope. A parameter so the scope can change without a
   * code change, and so a report can state what was actually allowed.
   */
  allowedAssetTypes: readonly AssetType[];
  /** The asset spent. USDT on BSC today; carried so a report is self-describing. */
  spendAsset: SpendAsset;
}

export interface SpendAsset {
  symbol: string;
  tokenContractAddress: string;
  /** Decimals used to build the smallest-unit amount. Verified against the provider's echo. */
  decimals: number;
}

/** Input identity of one tokenized representation, as discovered from RWA data. */
export interface RepresentationInput {
  platformId: string;
  underlyingTicker: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  binanceChainId: string;
  /** null is not a failure to hide: it becomes NULL_IDENTITY (DEC-020). */
  assetType: AssetType | null;
  underlyingName: string | null;
  tokenToShareRatio: string;
  /** Token decimals from the RWA list; the quote's echoed value wins when present. */
  decimals: string;
  /** Per-share price from /rwa/price referencePrice (F002 Amendment A1). Optional. */
  perSharePrice?: string | undefined;
}

/**
 * One candidate route. Blueprint 6.5, extended with the identity and provenance
 * fields a report and an audit need. `eligibility` is the verdict and
 * `rejectionReasons` is why - an ELIGIBLE candidate always has an empty list.
 */
export interface CandidateRoute {
  id: string;
  intentId: string;
  /** `${binanceChainId}:${tokenContractAddress}` - stable across runs. */
  representationId: string;

  platformId: string;
  underlyingTicker: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  binanceChainId: string;
  /** Carried on every candidate so an ETF is never reported as a stock (DEC-005). */
  assetType: AssetType | null;
  assetTypeLabel: string;
  tokenToShareRatio: string;

  quoteProvider: QuoteProvider;
  quoteId?: string | undefined;
  /** Spend, smallest-unit integer string of the spend asset. */
  inputAmount: string;
  /** Spend as a decimal string in the spend asset's own units, e.g. "100". */
  inputAmountDecimal: string;
  /** Provider's toTokenAmount, verbatim smallest-unit string. */
  expectedOutputTokenAmount?: string | undefined;
  /** Decimals actually used to scale the output. */
  toTokenDecimals?: string | undefined;
  /** (toTokenAmount / 10^decimals) * tokenToShareRatio - exact. */
  normalizedExpectedShares?: string | undefined;
  /** inputAmountDecimal / normalizedExpectedShares - exact. */
  effectivePricePerShare?: string | undefined;
  /** Per-share benchmark, /rwa/price referencePrice (Amendment A1). */
  referencePrice?: string | undefined;
  /** Deviation of effectivePricePerShare from referencePrice, bps, exact string. */
  referenceDeviationBps?: string | undefined;
  /** Provider priceImpactPercent converted to bps, exact string. */
  priceImpactBps?: string | undefined;
  tradeFee?: string | null | undefined;
  estimateGasFee?: string | null | undefined;
  /** Open strings, never branched on (F002 section 2). */
  executionMode?: string | undefined;
  vendorName?: string | undefined;

  quoteTimestamp?: string | undefined;
  /** Whole seconds between the quote and the decision instant. */
  quoteAgeSeconds?: number | undefined;
  /** evidence.provider_call.id for the quote that produced this candidate. */
  providerCallId?: string | undefined;

  eligibility: "ELIGIBLE" | "REJECTED";
  rejectionReasons: RejectionReason[];
}

export type DecisionOutcome = "SELECTED" | "NO_ELIGIBLE_ROUTE";

/** Blueprint 6.6, plus the explicit no-route outcome F002 T4 requires. */
export interface RouteDecision {
  intentId: string;
  /** null exactly when outcome is NO_ELIGIBLE_ROUTE. Never a fallback. */
  selectedCandidateId: string | null;
  algorithmVersion: string;
  /** Eligible candidates, best first. Rejected candidates never appear here. */
  rankedCandidateIds: string[];
  /** Why this outcome: the winning comparison steps, or every rejection code seen. */
  reasonCodes: string[];
  decidedAt: string;
  outcome: DecisionOutcome;
}
