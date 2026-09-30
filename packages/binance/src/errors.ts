/**
 * Typed errors for the Binance Web3 Wallet API envelope.
 * A response has HTTP 200 but `code !== 0` is still an error — see
 * https://web3.binance.com/en/dev-docs/authentication for the documented codes.
 */

export const DOCUMENTED_CODES = [
  "40001",
  "40101",
  "40102",
  "40103",
  "40104",
  "42900",
  "50000",
  "50001",
] as const;

export type DocumentedCode = (typeof DOCUMENTED_CODES)[number];

/** Codes for which a retry can never succeed (auth/replay failures). */
export const NO_RETRY_CODES: ReadonlySet<DocumentedCode> = new Set(["40101", "40102", "40104"]);

/**
 * The envelope as it arrives on the wire. `code` is declared `string | number`
 * because the provider sends it as a JSON NUMBER (confirmed live 2026-09-30
 * across every Trading, Transaction and RWA endpoint this project calls), while
 * the docs present the codes as strings. Consumers must compare against
 * `BinanceApiError.code`, which is normalized to a string - never against
 * `envelope.code` directly.
 */
export interface ProviderEnvelope {
  code: string | number;
  message?: string;
  [key: string]: unknown;
}

export class BinanceApiError extends Error {
  readonly code: string;
  readonly documented: boolean;
  readonly httpStatus: number;
  readonly envelope: ProviderEnvelope;

  constructor(envelope: ProviderEnvelope, httpStatus: number) {
    super(
      `Binance Web3 API error ${envelope.code}${envelope.message ? `: ${envelope.message}` : ""}`,
    );
    this.name = "BinanceApiError";
    // Normalized to a string at the boundary. The provider sends a JSON
    // number, so comparing the raw value against the documented string codes
    // silently never matched: `documented` was always false and
    // `isRetryable()` always true, which meant even an auth failure
    // (40101/40102/40104) was retried the full maxRetries times instead of
    // failing fast. Confirmed live 2026-09-30.
    this.code = String(envelope.code);
    this.documented = (DOCUMENTED_CODES as readonly string[]).includes(this.code);
    this.httpStatus = httpStatus;
    this.envelope = envelope;
  }

  isRetryable(): boolean {
    return !NO_RETRY_CODES.has(this.code as DocumentedCode);
  }
}

export class BinanceRateLimitError extends Error {
  readonly retryAfterMs: number | undefined;
  readonly httpStatus = 429;

  constructor(retryAfterMs: number | undefined) {
    super(
      `Binance Web3 API rate limited${retryAfterMs !== undefined ? ` (retry after ${retryAfterMs}ms)` : ""}`,
    );
    this.name = "BinanceRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface NonJsonResponseDetails {
  httpStatus: number;
  statusText: string;
  contentType: string | undefined;
  contentLength: string | undefined;
  /** Present only when the response passed through (or was blocked by) an AWS WAF. */
  wafAction: string | undefined;
  /** Present only when the provider's own gateway attaches a trace id. */
  traceId: string | undefined;
  /** Present only when the provider's own gateway names what blocked the request. */
  blockedBy: string | undefined;
}

/**
 * Thrown when a response's body doesn't parse as JSON - e.g. a WAF challenge
 * page (HTTP 202, zero-byte body) or a gateway-level rejection (HTTP 414)
 * that never reaches the provider's own envelope format. Carries every
 * diagnostic header available so a caller (or the evidence recorder) never
 * has to re-derive "why" from a bare "non-JSON" message.
 */
export class BinanceNonJsonResponseError extends Error {
  readonly httpStatus: number;
  readonly statusText: string;
  readonly contentType: string | undefined;
  readonly contentLength: string | undefined;
  readonly wafAction: string | undefined;
  readonly traceId: string | undefined;
  readonly blockedBy: string | undefined;

  constructor(details: NonJsonResponseDetails) {
    const extras = [
      details.contentType !== undefined ? `content-type=${details.contentType}` : undefined,
      details.contentLength !== undefined ? `content-length=${details.contentLength}` : undefined,
      details.wafAction !== undefined ? `x-amzn-waf-action=${details.wafAction}` : undefined,
      details.traceId !== undefined ? `x-oc-trace-id=${details.traceId}` : undefined,
      details.blockedBy !== undefined ? `x-oc-blocked-by=${details.blockedBy}` : undefined,
    ].filter((s): s is string => s !== undefined);
    super(
      `Binance Web3 API returned a non-JSON response body (HTTP ${details.httpStatus} ${details.statusText})` +
        (extras.length > 0 ? ` [${extras.join(", ")}]` : ""),
    );
    this.name = "BinanceNonJsonResponseError";
    this.httpStatus = details.httpStatus;
    this.statusText = details.statusText;
    this.contentType = details.contentType;
    this.contentLength = details.contentLength;
    this.wafAction = details.wafAction;
    this.traceId = details.traceId;
    this.blockedBy = details.blockedBy;
  }

  /**
   * Never retry a 4xx except 408 (request timeout) - 429 is handled
   * separately by the client, before a body is even inspected. 5xx is
   * retried, since it may be transient.
   */
  isRetryable(): boolean {
    return this.httpStatus === 408 || (this.httpStatus >= 500 && this.httpStatus <= 599);
  }
}
