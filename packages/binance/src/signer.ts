import { createHmac } from "node:crypto";

/**
 * Signing per https://web3.binance.com/en/dev-docs/authentication:
 * preHash = timestamp + METHOD + requestPath (including the `/build` prefix,
 * with the raw URL-encoded query string appended) + body.
 * HMAC-SHA256 of preHash with the API secret, base64-encoded.
 */
export interface SignInput {
  /** ISO-8601 timestamp with millisecond precision, e.g. 2026-01-01T00:00:00.000Z */
  timestamp: string;
  method: string;
  /** Must already include the `/build` prefix, e.g. /build/api/v1/dex/market/rwa/tokens */
  requestPath: string;
  /** Raw, already URL-encoded query string without a leading `?`. Omit or empty for none. */
  query?: string;
  /** Raw request body as sent on the wire (JSON string). Omit or empty for none. */
  body?: string;
  secret: string;
}

export function buildPreHash(input: Omit<SignInput, "secret">): string {
  const { timestamp, method, requestPath, query = "", body = "" } = input;
  const pathWithQuery = query.length > 0 ? `${requestPath}?${query}` : requestPath;
  return `${timestamp}${method.toUpperCase()}${pathWithQuery}${body}`;
}

export function sign(input: SignInput): string {
  const preHash = buildPreHash(input);
  return createHmac("sha256", input.secret).update(preHash).digest("base64");
}

export function isoMillisecondTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}
