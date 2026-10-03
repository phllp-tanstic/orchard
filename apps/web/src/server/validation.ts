import { z } from "zod";
import { Decimal } from "decimal.js";

/**
 * Server-side input validation (F003 T2). Everything that is not explicitly
 * allowed is rejected with a typed error; nothing is coerced into something
 * plausible.
 *
 * Shared with client components for inline hints, so this file must stay free
 * of secrets and of `server-only` - it contains no configuration, only shapes.
 * The BOUNDS are passed in, because they are product defaults the server owns.
 */

/** Tickers as the provider emits them: letters, digits, dot and dash. */
export const TICKER_PATTERN = /^[A-Za-z0-9.-]{1,16}$/;

export const tickerSchema = z
  .string()
  .trim()
  .regex(TICKER_PATTERN, "Enter a ticker using letters, numbers, dot or dash (max 16).")
  .transform((v) => v.toUpperCase());

/** A plain decimal. No sign, no exponent, no separators - the engine's rule. */
export const PLAIN_DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Enter at least one character.").max(64),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type AmountProblem = "NOT_A_NUMBER" | "BELOW_MIN" | "ABOVE_MAX" | "TOO_PRECISE";

export interface AmountCheck {
  ok: boolean;
  problem?: AmountProblem;
  message?: string;
}

/**
 * Validates an amount against the configured bounds using decimal.js, never a
 * float: `Number("0.1")` arithmetic is exactly what the money rules forbid.
 *
 * `maxDecimals` guards against an amount the spend asset cannot express. USDT
 * on BSC has 18 decimals, so this is generous; it exists so a pathological
 * input cannot reach `toSmallestUnit` and throw there.
 */
export function checkAmount(
  raw: string,
  bounds: { min: string; max: string; maxDecimals?: number },
): AmountCheck {
  const value = raw.trim();
  if (!PLAIN_DECIMAL.test(value)) {
    return {
      ok: false,
      problem: "NOT_A_NUMBER",
      message: "Enter an amount as plain digits, for example 100 or 100.50.",
    };
  }
  const decimals = value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
  const maxDecimals = bounds.maxDecimals ?? 18;
  if (decimals > maxDecimals) {
    return {
      ok: false,
      problem: "TOO_PRECISE",
      message: `Use at most ${maxDecimals} decimal places.`,
    };
  }
  const amount = new Decimal(value);
  if (amount.lessThan(new Decimal(bounds.min))) {
    return {
      ok: false,
      problem: "BELOW_MIN",
      message: `The minimum amount is ${bounds.min} USDT.`,
    };
  }
  if (amount.greaterThan(new Decimal(bounds.max))) {
    return {
      ok: false,
      problem: "ABOVE_MAX",
      message: `The maximum amount is ${bounds.max} USDT.`,
    };
  }
  return { ok: true };
}

export const previewBodySchema = z.object({
  ticker: tickerSchema,
  amount: z.string().trim().min(1).max(32),
});

export type PreviewBody = z.infer<typeof previewBodySchema>;

/** Typed error codes the API returns. Each maps to one honest UI state. */
export const API_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  // Only /api/diag uses this. No public endpoint authenticates anybody: the
  // app is anonymous by design (F003), and diag is an operator tool gated on
  // WEB_DIAG_TOKEN rather than a user-facing feature.
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "BUSY",
  "PROVIDER_UNAVAILABLE",
  "SNAPSHOT_UNAVAILABLE",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; fields?: Record<string, string> };
}

export const HTTP_STATUS_FOR_ERROR: Readonly<Record<ApiErrorCode, number>> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  BUSY: 503,
  PROVIDER_UNAVAILABLE: 502,
  SNAPSHOT_UNAVAILABLE: 503,
  INTERNAL: 500,
};
