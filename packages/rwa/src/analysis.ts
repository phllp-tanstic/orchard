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

/**
 * DEC-026: what the referencePrice check answers.
 *
 * It compares /rwa/tokens referencePrice (read at T1) against /rwa/price
 * tokenPrice (read at T2, seconds later). The investigation recorded in
 * docs/DEVEX_LOG.md established these are the same per-underlying-share
 * quantity: across all 485 paired tokens in probe_run 634f558e their median
 * difference was 1.7e-13 bps, and both endpoints satisfy
 * tokenPrice / referencePrice == tokenToShareRatio internally.
 *
 * So the only thing separating the two readings is elapsed time. This is a
 * temporal-consistency check, NOT a test of whether referencePrice is
 * independently sourced - the earlier verdicts ("independent",
 * "derived-from-tokenPrice") compared per-share against per-token numbers
 * and measured tokenToShareRatio rather than any pricing relationship.
 */
export type ReferencePriceStabilityVerdict = "stable" | "unstable" | "inconclusive";

/**
 * A median absolute drift at or below this counts as stable. 1 bps is 0.01%:
 * below the per-token movement seen over the seconds between the two calls
 * in probe_run 634f558e (p50 ~0 bps, p90 1.21 bps).
 */
const STABLE_MEDIAN_ABS_BPS = new Decimal(1);

/**
 * Verdict from the median absolute drift, not the extremes: a handful of
 * fast-moving tokens should not make a whole run read as unstable. The tails
 * are reported separately through BpsSummary min/max and their extreme tokens.
 */
export function classifyReferencePriceStability(
  perShareDrift: BpsSummary,
): ReferencePriceStabilityVerdict {
  if (perShareDrift.sampleSize === 0 || perShareDrift.medianAbs === undefined) {
    return "inconclusive";
  }
  return new Decimal(perShareDrift.medianAbs).lessThanOrEqualTo(STABLE_MEDIAN_ABS_BPS)
    ? "stable"
    : "unstable";
}
