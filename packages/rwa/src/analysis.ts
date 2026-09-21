import { Decimal } from "decimal.js";

export interface BpsSummary {
  sampleSize: number;
  min: string | undefined;
  max: string | undefined;
  medianAbs: string | undefined;
}

export function summarizeBps(values: readonly Decimal[]): BpsSummary {
  if (values.length === 0) {
    return { sampleSize: 0, min: undefined, max: undefined, medianAbs: undefined };
  }
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const absSorted = values.map((v) => v.abs()).sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(absSorted.length / 2);
  const medianAbs =
    absSorted.length % 2 === 1
      ? absSorted[mid]!
      : absSorted[mid - 1]!.plus(absSorted[mid]!).dividedBy(2);
  return {
    sampleSize: values.length,
    min: min.toString(),
    max: max.toString(),
    medianAbs: medianAbs.toString(),
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
