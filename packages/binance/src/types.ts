import type { ProviderEnvelope } from "./errors.js";

export interface BinanceClientOptions {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  /** X-OC-RECV-WINDOW, ms. Optional; omitted from the request if unset. */
  recvWindowMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  nonce?: () => string;
  /**
   * Called once per HTTP attempt (including retries) with everything an
   * evidence recorder needs to persist. Secrets are never included. This is
   * the seam T3's evidence recorder attaches to — the client itself does not
   * persist anything.
   */
  onCall?: (record: ProviderCallRecord) => void;
}

export interface RequestSpec {
  method: string;
  /** Path relative to the API root, WITHOUT the `/build` prefix, e.g. /api/v1/dex/market/rwa/tokens */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/** Redacted request/response metadata for one HTTP attempt, secret-free. */
export interface ProviderCallRecord {
  provider: "binance";
  method: string;
  /** Full request path including the /build prefix and query string. */
  endpoint: string;
  attempt: number;
  httpStatus: number | undefined;
  providerCode: string | undefined;
  latencyMs: number;
  rateLimitHeaders: Record<string, string>;
  /** Present only when the HTTP call itself failed before a response was received. */
  networkError: string | undefined;
  timestamp: string;
}

export interface BinanceCallResult<T> {
  data: T;
  envelope: ProviderEnvelope;
  httpStatus: number;
  rateLimitHeaders: Record<string, string>;
  attempts: number;
}
