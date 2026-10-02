import { Decimal } from "decimal.js";

/**
 * Normalization for the best-execution engine (F002 T1), per spec Amendment A1.
 *
 * decimal.js only. No JavaScript float touches a money, price, ratio or share
 * quantity anywhere in this file (AGENTS.md hard rule).
 *
 * The formula, confirmed live (probe_run b44704bc-7870-474b-9c66-4688b6cbb9c1,
 * ratio >= 2 group 9/9 within 51.4 bps of the per-share benchmark):
 *
 *   normalizedShares     = (toTokenAmount / 10^decimals) * tokenToShareRatio
 *   impliedPricePerShare = spendAmount / normalizedShares
 *
 * The 10^decimals step converts the provider's smallest-unit integer string to
 * whole tokens. The per-share BENCHMARK is `/rwa/price` referencePrice; the
 * `/rwa/tokens` referencePrice and tokenPrice fields are NOT per-share
 * (Amendment A1), and nothing here uses them.
 */

/** A plain unsigned decimal: "0", or no-leading-zero integer part with optional fraction. */
const PLAIN_DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

/** An unsigned base-10 integer with no leading zeros, i.e. a smallest-unit amount. */
const SMALLEST_UNIT = /^(0|[1-9]\d*)$/;

export function isPlainDecimal(value: string): boolean {
  return PLAIN_DECIMAL.test(value);
}

export function isSmallestUnitAmount(value: string): boolean {
  return SMALLEST_UNIT.test(value);
}

/**
 * Why a tokenToShareRatio can never be used, or undefined when it is fine.
 * Mirrors @orchard/rwa's ratioAnomalyReason intent but is stated here as the
 * engine's own gate, because an unusable ratio is an eligibility rejection
 * (INVALID_RATIO) rather than a thrown error.
 */
export function ratioRejectionDetail(tokenToShareRatio: string): string | undefined {
  if (tokenToShareRatio.trim() === "") return "tokenToShareRatio is empty";
  if (!PLAIN_DECIMAL.test(tokenToShareRatio)) {
    return `tokenToShareRatio is not a plain decimal number: "${tokenToShareRatio}"`;
  }
  if (new Decimal(tokenToShareRatio).isZero()) return "tokenToShareRatio is zero";
  return undefined;
}

export interface NormalizeSharesInput {
  /** Provider toTokenAmount, smallest-unit integer string. */
  toTokenAmount: string;
  /** Token decimals. Prefer the quote's echoed toToken.decimal over the list value. */
  toTokenDecimals: string | number;
  tokenToShareRatio: string;
}

/**
 * normalizedShares = (toTokenAmount / 10^decimals) * tokenToShareRatio.
 * Throws on inputs that must never reach it; callers gate with
 * `ratioRejectionDetail` first and record INVALID_RATIO instead.
 */
export function normalizeShares(input: NormalizeSharesInput): Decimal {
  const { toTokenAmount, toTokenDecimals, tokenToShareRatio } = input;
  if (!SMALLEST_UNIT.test(toTokenAmount)) {
    throw new Error(`toTokenAmount must be a smallest-unit integer string, got "${toTokenAmount}"`);
  }
  const decimals = Number(toTokenDecimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`toTokenDecimals must be an integer in [0,36], got "${toTokenDecimals}"`);
  }
  const ratioProblem = ratioRejectionDetail(tokenToShareRatio);
  if (ratioProblem !== undefined) throw new Error(ratioProblem);

  return new Decimal(toTokenAmount)
    .dividedBy(new Decimal(10).pow(decimals))
    .times(new Decimal(tokenToShareRatio));
}

/**
 * effectivePricePerShare = spendAmount / normalizedShares, in the spend
 * asset's own units. Returns undefined when shares are zero: no price exists,
 * and inventing one would be a fabricated number.
 */
export function effectivePricePerShare(
  spendAmountDecimal: string | Decimal,
  normalizedShares: Decimal,
): Decimal | undefined {
  if (normalizedShares.isZero() || normalizedShares.isNegative()) return undefined;
  const spend =
    spendAmountDecimal instanceof Decimal ? spendAmountDecimal : new Decimal(spendAmountDecimal);
  return spend.dividedBy(normalizedShares);
}

/**
 * Whole seconds between a quote's timestamp and `now`, rounded to the nearest
 * second. Negative when the quote timestamp is in the future (clock skew),
 * which callers surface rather than clamp.
 */
export function quoteAgeSeconds(quoteTimestamp: string | Date, now: Date): number {
  const quoted = quoteTimestamp instanceof Date ? quoteTimestamp : new Date(quoteTimestamp);
  const ms = quoted.getTime();
  if (Number.isNaN(ms))
    throw new Error(`quoteTimestamp is not a valid date: "${String(quoteTimestamp)}"`);
  return Math.round((now.getTime() - ms) / 1000);
}

/** (a - b) / b in basis points, exact. undefined when b is zero. */
export function deviationBps(a: Decimal, b: Decimal): Decimal | undefined {
  if (b.isZero()) return undefined;
  return a.minus(b).dividedBy(b).times(10000);
}

/**
 * Provider priceImpactPercent (a percent, e.g. "0.04") to basis points.
 * Accepts a leading minus, which the provider does emit. undefined when the
 * value is absent or not numeric - reported as unknown, never as zero.
 */
export function priceImpactPercentToBps(value: string | null | undefined): Decimal | undefined {
  if (value === null || value === undefined || value.trim() === "") return undefined;
  const signed = /^-?(0|[1-9]\d*)(\.\d+)?$/;
  if (!signed.test(value)) return undefined;
  return new Decimal(value).times(100);
}

/**
 * A whole-unit decimal amount to the asset's smallest unit, exactly. Throws
 * rather than truncate, so a spend that cannot be expressed is never silently
 * rounded into one that can.
 */
export function toSmallestUnit(amountDecimal: string, decimals: number): string {
  if (!PLAIN_DECIMAL.test(amountDecimal)) {
    throw new Error(`amount must be a plain decimal string, got "${amountDecimal}"`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`decimals must be an integer in [0,36], got ${decimals}`);
  }
  const scaled = new Decimal(amountDecimal).times(new Decimal(10).pow(decimals));
  if (!scaled.isInteger()) {
    throw new Error(
      `amount ${amountDecimal} is not expressible in whole smallest units at ${decimals} decimals`,
    );
  }
  return scaled.toFixed(0);
}
