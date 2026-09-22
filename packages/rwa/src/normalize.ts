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
 * A plain unsigned decimal: "0", or a no-leading-zero integer part optionally
 * followed by a fractional part. No sign, no exponent, no hex/binary/octal
 * prefix, no digit-group separators - each of those parses as a number in
 * some context (JS numeric literals, decimal.js exponent notation) but is
 * not what the RWA data API documents `tokenToShareRatio` as, so DEC-013 A2
 * treats any of them as an anomaly rather than silently accepting them.
 */
const PLAIN_DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;

/**
 * Validates tokenToShareRatio before it ever reaches a NUMERIC column or a
 * division. Returns a human-readable reason when the value is unusable, or
 * undefined when it's fine. Never throws - callers use this to record a
 * ratio anomaly and keep the run INCOMPLETE rather than crash or attempt to
 * store an invalid NUMERIC.
 */
export function ratioAnomalyReason(tokenToShareRatio: string): string | undefined {
  if (tokenToShareRatio.trim() === "") {
    return "tokenToShareRatio is empty";
  }
  if (!PLAIN_DECIMAL_PATTERN.test(tokenToShareRatio)) {
    return `tokenToShareRatio is not a plain decimal number (no sign, exponent, alternate base, or digit separators): "${tokenToShareRatio}"`;
  }
  if (new Decimal(tokenToShareRatio).isZero()) {
    return "tokenToShareRatio is zero";
  }
  return undefined;
}
