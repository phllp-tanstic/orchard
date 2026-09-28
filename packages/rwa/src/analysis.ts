import { Decimal } from "decimal.js";

/** Identifies the single representation a bps extreme belongs to. */
export interface BpsTokenRef {
  tokenContractAddress: string;
  platformId: string;
  underlyingTicker: string;
}

/** One bps observation together with the representation it was computed from. */
export interface BpsSample {
  value: Decimal;
  token: BpsTokenRef;
}

export interface BpsSummary {
  sampleSize: number;
  min: string | undefined;
  max: string | undefined;
  medianAbs: string | undefined;
  /** The representation `min` belongs to. A tied minimum resolves to the first such sample in input order. */
  minToken: BpsTokenRef | undefined;
  /** The representation `max` belongs to. A tied maximum resolves to the last such sample in input order. */
  maxToken: BpsTokenRef | undefined;
}

export function summarizeBps(samples: readonly BpsSample[]): BpsSummary {
  if (samples.length === 0) {
    return {
      sampleSize: 0,
      min: undefined,
      max: undefined,
      medianAbs: undefined,
      minToken: undefined,
      maxToken: undefined,
    };
  }
  // Array.prototype.sort is stable, so equal values keep their input order:
  // a tied min resolves to the first such sample, a tied max to the last.
  const sorted = [...samples].sort((a, b) => a.value.comparedTo(b.value));
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const absSorted = samples.map((s) => s.value.abs()).sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(absSorted.length / 2);
  const medianAbs =
    absSorted.length % 2 === 1
      ? absSorted[mid]!
      : absSorted[mid - 1]!.plus(absSorted[mid]!).dividedBy(2);
  return {
    sampleSize: samples.length,
    min: min.value.toString(),
    max: max.value.toString(),
    medianAbs: medianAbs.toString(),
    minToken: min.token,
    maxToken: max.token,
  };
}

export type ReferencePriceVerdict =
  "derived-from-tokenPrice" | "derived-from-impliedPricePerShare" | "independent" | "inconclusive";

/** A median absolute bps difference at or below this counts as "matches" for verdict purposes. */
const NEAR_ZERO_BPS_THRESHOLD = new Decimal(1);

/**
 * Per spec T4 step 7: state whether referencePrice appears independent or
 * derived, by comparing its typical bps distance from tokenPrice and from
 * tokenPrice/tokenToShareRatio (impliedPricePerShare).
 */
export function classifyReferencePrice(
  vsTokenPrice: BpsSummary,
  vsImplied: BpsSummary,
): ReferencePriceVerdict {
  if (vsTokenPrice.sampleSize === 0 && vsImplied.sampleSize === 0) return "inconclusive";

  const tokenPriceNear =
    vsTokenPrice.medianAbs !== undefined &&
    new Decimal(vsTokenPrice.medianAbs).lessThanOrEqualTo(NEAR_ZERO_BPS_THRESHOLD);
  const impliedNear =
    vsImplied.medianAbs !== undefined &&
    new Decimal(vsImplied.medianAbs).lessThanOrEqualTo(NEAR_ZERO_BPS_THRESHOLD);

  if (tokenPriceNear && !impliedNear) return "derived-from-tokenPrice";
  if (impliedNear && !tokenPriceNear) return "derived-from-impliedPricePerShare";
  // Both match (e.g. ratio is 1, so tokenPrice === impliedPricePerShare) or
  // neither matches closely: can't cleanly distinguish a single driver.
  if (tokenPriceNear && impliedNear) return "derived-from-tokenPrice";
  return "independent";
}
