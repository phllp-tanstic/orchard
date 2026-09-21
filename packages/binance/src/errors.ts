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

export interface ProviderEnvelope {
  code: string;
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
    this.code = envelope.code;
    this.documented = (DOCUMENTED_CODES as readonly string[]).includes(envelope.code);
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
