import { Decimal } from "decimal.js";

/**
 * impliedPricePerShare = tokenPrice / tokenToShareRatio, per
 * docs/specs/F001A-spec.md T4 step 3. decimal.js only - never a JS float
 * (AGENTS.md hard rule).
 */
export function impliedPricePerShare(tokenPrice: string, tokenToShareRatio: string): Decimal {
  const ratio = new Decimal(tokenToShareRatio);
  if (ratio.isZero()) {
    throw new Error(`tokenToShareRatio is zero - cannot compute impliedPricePerShare`);
  }
  return new Decimal(tokenPrice).dividedBy(ratio);
}

/** (a - b) / b * 10000, in basis points. Returns undefined when b is zero (division undefined). */
export function bpsDifference(a: Decimal, b: Decimal): Decimal | undefined {
  if (b.isZero()) return undefined;
  return a.minus(b).dividedBy(b).times(10_000);
}

export function parseDecimal(value: string): Decimal {
  return new Decimal(value);
}

/**
 * Validates tokenToShareRatio before it ever reaches a NUMERIC column or a
 * division. Returns a human-readable reason when the value is unusable
 * (empty, non-numeric, zero, or negative - none of these are meaningful
 * share ratios), or undefined when it's fine. Never throws - callers use
 * this to record a ratio anomaly and keep the run INCOMPLETE rather than
 * crash or attempt to store an invalid NUMERIC.
 */
export function ratioAnomalyReason(tokenToShareRatio: string): string | undefined {
  if (tokenToShareRatio.trim() === "") {
    return "tokenToShareRatio is empty";
  }
  let ratio: Decimal;
  try {
    ratio = new Decimal(tokenToShareRatio);
  } catch {
    return `tokenToShareRatio is not a valid number: "${tokenToShareRatio}"`;
  }
  if (ratio.isNaN() || !ratio.isFinite()) {
    return `tokenToShareRatio is not a valid number: "${tokenToShareRatio}"`;
  }
  if (ratio.isZero()) {
    return "tokenToShareRatio is zero";
  }
  if (ratio.isNegative()) {
    return `tokenToShareRatio is negative: "${tokenToShareRatio}"`;
  }
  return undefined;
}
