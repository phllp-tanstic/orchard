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
