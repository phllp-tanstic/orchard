import { randomUUID } from "node:crypto";
import { sign } from "./signer.js";
import {
  BinanceApiError,
  BinanceNonJsonResponseError,
  BinanceRateLimitError,
  type ProviderEnvelope,
} from "./errors.js";
import { RateLimiter } from "./limiter.js";
import type {
  BinanceClientOptions,
  BinanceCallResult,
  ProviderCallRecord,
  RequestSpec,
} from "./types.js";

const BUILD_PREFIX = "/build";
const TRAILING_BUILD_PREFIX = /\/build$/;
const DEFAULT_MAX_RETRIES = 3;
const RATE_LIMIT_HEADER_PREFIX = "x-oc-ratelimit-";

/** Omits keys whose value is undefined - required by exactOptionalPropertyTypes for optional fields. */
function definedFields<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: { [K in keyof T]?: Exclude<T[K], undefined> } = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) out[key] = value as Exclude<T[typeof key], undefined>;
  }
  return out;
}

function encodeQuery(query: RequestSpec["query"]): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}

function extractRateLimitHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith(RATE_LIMIT_HEADER_PREFIX)) {
      out[key] = value;
    }
  });
  return out;
}

export class BinanceWeb3Client {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly recvWindowMs: number | undefined;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly nonce: () => string;
  private readonly onCall: ((record: ProviderCallRecord) => void) | undefined;
  private readonly limiter: RateLimiter;

  constructor(options: BinanceClientOptions) {
    if (!options.apiKey || !options.apiSecret) {
      throw new Error(
        "BinanceWeb3Client requires apiKey and apiSecret (read from env, never hardcode)",
      );
    }
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    // The client owns BUILD_PREFIX: it prepends `/build` to every path and
    // signs that exact string. The authentication doc states the base URL as
    // `https://web3.binance.com/build`, so a configured base URL that already
    // carries the prefix must have it stripped here - otherwise the wire path
    // becomes `/build/build/...`, which is not an API route. That path falls
    // through to the WAF-protected web app, which answers HTTP 202 with
    // `x-amzn-waf-action: challenge` and a zero-byte body, never a provider
    // envelope. Accept the base URL with or without the prefix.
    this.baseUrl = options.baseUrl.replace(/\/+$/, "").replace(TRAILING_BUILD_PREFIX, "");
    this.recvWindowMs = options.recvWindowMs;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.nonce = options.nonce ?? (() => randomUUID());
    this.onCall = options.onCall;
    this.limiter = new RateLimiter();
  }

  async request<T = unknown>(spec: RequestSpec): Promise<BinanceCallResult<T>> {
    const requestPath = `${BUILD_PREFIX}${spec.path}`;
    const query = encodeQuery(spec.query);
    const body = spec.body !== undefined ? JSON.stringify(spec.body) : "";
    const limiterKey = spec.path;

    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.maxRetries) {
      attempt += 1;
      await this.limiter.acquire(limiterKey);

      const timestamp = this.now().toISOString();
      const nonce = this.nonce();
      const signature = sign({
        timestamp,
        method: spec.method,
        requestPath,
        query,
        body,
        secret: this.apiSecret,
      });

      const url = new URL(`${this.baseUrl}${requestPath}`);
      if (query) url.search = query;

      const headers: Record<string, string> = {
        "X-OC-APIKEY": this.apiKey,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signature,
        "X-OC-NONCE": nonce,
        "Content-Type": "application/json",
      };
      if (this.recvWindowMs !== undefined) {
        headers["X-OC-RECV-WINDOW"] = String(this.recvWindowMs);
      }

      const startedAt = Date.now();
      let httpStatus: number | undefined;
      let providerCode: string | undefined;
      let rateLimitHeaders: Record<string, string> = {};
      let networkError: string | undefined;
      let rawResponseBody: string | undefined;
      let responseJson: unknown;
      let httpStatusText: string | undefined;
      let contentType: string | undefined;
      let contentLength: string | undefined;
      let wafAction: string | undefined;
      let traceId: string | undefined;
      let blockedBy: string | undefined;

      try {
        const requestInit: RequestInit = { method: spec.method, headers };
        if (spec.body !== undefined) requestInit.body = body;
        const response = await this.fetchImpl(url, requestInit);
        httpStatus = response.status;
        httpStatusText = response.statusText;
        contentType = response.headers.get("content-type") ?? undefined;
        contentLength = response.headers.get("content-length") ?? undefined;
        wafAction = response.headers.get("x-amzn-waf-action") ?? undefined;
        traceId = response.headers.get("x-oc-trace-id") ?? undefined;
        blockedBy = response.headers.get("x-oc-blocked-by") ?? undefined;
        rateLimitHeaders = extractRateLimitHeaders(response.headers);
        rawResponseBody = await response.text();
        try {
          responseJson = rawResponseBody.length > 0 ? JSON.parse(rawResponseBody) : undefined;
        } catch {
          responseJson = undefined;
        }

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterMs =
            retryAfterHeader !== null ? Number(retryAfterHeader) * 1_000 : undefined;
          this.recordCall({
            spec,
            requestPath,
            query,
            attempt,
            httpStatus,
            providerCode,
            rateLimitHeaders,
            networkError,
            rawResponseBody,
            responseJson,
            startedAt,
            httpStatusText,
            contentType,
            contentLength,
            wafAction,
            traceId,
            blockedBy,
          });
          lastError = new BinanceRateLimitError(retryAfterMs);
          if (attempt >= this.maxRetries) throw lastError;
          await this.sleep(retryAfterMs ?? 1_000);
          continue;
        }

        if (responseJson === undefined) {
          const nonJsonError = new BinanceNonJsonResponseError({
            httpStatus,
            statusText: httpStatusText,
            contentType,
            contentLength,
            wafAction,
            traceId,
            blockedBy,
          });
          this.recordCall({
            spec,
            requestPath,
            query,
            attempt,
            httpStatus,
            providerCode,
            rateLimitHeaders,
            networkError,
            rawResponseBody,
            responseJson,
            startedAt,
            httpStatusText,
            contentType,
            contentLength,
            wafAction,
            traceId,
            blockedBy,
          });
          lastError = nonJsonError;
          if (!nonJsonError.isRetryable() || attempt >= this.maxRetries) {
            throw nonJsonError;
          }
          continue;
        }
        const envelope = responseJson as ProviderEnvelope;
        providerCode = String(envelope.code);
        this.recordCall({
          spec,
          requestPath,
          query,
          attempt,
          httpStatus,
          providerCode,
          rateLimitHeaders,
          networkError,
          rawResponseBody,
          responseJson,
          startedAt,
          httpStatusText,
          contentType,
          contentLength,
          wafAction,
          traceId,
          blockedBy,
        });

        if (providerCode !== "0") {
          const apiError = new BinanceApiError(envelope, httpStatus);
          lastError = apiError;
          if (!apiError.isRetryable() || attempt >= this.maxRetries) {
            throw apiError;
          }
          continue;
        }

        return {
          data: envelope["data"] as T,
          envelope,
          httpStatus,
          rateLimitHeaders,
          attempts: attempt,
        };
      } catch (err) {
        if (
          err instanceof BinanceApiError ||
          err instanceof BinanceRateLimitError ||
          err instanceof BinanceNonJsonResponseError
        ) {
          throw err;
        }
        networkError = err instanceof Error ? err.message : String(err);
        this.recordCall({
          spec,
          requestPath,
          query,
          attempt,
          httpStatus,
          providerCode,
          rateLimitHeaders,
          networkError,
          rawResponseBody,
          responseJson,
          startedAt,
          httpStatusText,
          contentType,
          contentLength,
          wafAction,
          traceId,
          blockedBy,
        });
        lastError = err;
        if (attempt >= this.maxRetries) throw lastError;
      }
    }

    throw lastError ?? new Error("BinanceWeb3Client: exhausted retries with no recorded error");
  }

  private recordCall(args: {
    spec: RequestSpec;
    requestPath: string;
    query: string;
    attempt: number;
    httpStatus: number | undefined;
    providerCode: string | undefined;
    rateLimitHeaders: Record<string, string>;
    networkError: string | undefined;
    rawResponseBody: string | undefined;
    responseJson: unknown;
    startedAt: number;
    httpStatusText: string | undefined;
    contentType: string | undefined;
    contentLength: string | undefined;
    wafAction: string | undefined;
    traceId: string | undefined;
    blockedBy: string | undefined;
  }): void {
    if (!this.onCall) return;
    const {
      spec,
      requestPath,
      query,
      attempt,
      httpStatus,
      providerCode,
      rateLimitHeaders,
      networkError,
      rawResponseBody,
      responseJson,
      startedAt,
      httpStatusText,
      contentType,
      contentLength,
      wafAction,
      traceId,
      blockedBy,
    } = args;
    this.onCall({
      provider: "binance",
      method: spec.method,
      endpoint: query ? `${requestPath}?${query}` : requestPath,
      attempt,
      httpStatus,
      providerCode,
      latencyMs: Date.now() - startedAt,
      rateLimitHeaders,
      networkError,
      timestamp: this.now().toISOString(),
      requestQuery: spec.query,
      requestBody: spec.body,
      rawResponseBody,
      ...definedFields({
        httpStatusText,
        contentType,
        contentLength,
        wafAction,
        traceId,
        blockedBy,
      }),
      responseJson,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
