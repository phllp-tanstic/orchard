import "server-only";
import { NextResponse } from "next/server";
import { ALGORITHM_VERSION } from "@orchard/execution";
import { serverEnv } from "./env";
import { previewPolicy } from "./preview";
import {
  BudgetExhaustedError,
  ConcurrencyBudget,
  RateLimiter,
  SingleFlight,
  clientIpOf,
} from "./guards";
import { HTTP_STATUS_FOR_ERROR, type ApiErrorBody, type ApiErrorCode } from "./validation";
import type { PreviewDto } from "./dto";

/**
 * Shared API plumbing (F003 T2): the typed error envelope, the no-store
 * caching rule, and the process-wide guards.
 *
 * The guards are module-level singletons on purpose. F003 section 4 requires
 * exactly ONE server instance because the provider limit is per key and these
 * limiters are in-process; more than one instance would silently multiply the
 * budget. /api/capabilities reports that assumption so it is visible rather
 * than tacit.
 */

export function apiError(
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...(fields !== undefined ? { fields } : {}) } },
    {
      status: HTTP_STATUS_FOR_ERROR[code],
      // Nothing from this API is cacheable: a preview is only valid for
      // seconds and a stale one must never be served.
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function apiOk<T>(body: T, extraHeaders: Record<string, string> = {}): NextResponse<T> {
  return apiJson(body, 200, extraHeaders);
}

/**
 * A success-shaped body at a chosen status. /api/health needs this: its body
 * is a real measurement either way, but a readiness failure has to answer 503
 * so a load balancer acts on it instead of parsing JSON.
 */
export function apiJson<T>(
  body: T,
  status: number,
  extraHeaders: Record<string, string> = {},
): NextResponse<T> {
  return NextResponse.json(body, {
    status,
    // Nothing from this API is cacheable: a preview is only valid for seconds
    // and a stale one must never be served.
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

// --- process-wide guards -----------------------------------------------------

let limiter: RateLimiter | undefined;
let readLimiter: RateLimiter | undefined;
let budget: ConcurrencyBudget | undefined;
const flight = new SingleFlight<PreviewDto>();

export function previewRateLimiter(): RateLimiter {
  if (limiter === undefined) {
    const env = serverEnv();
    limiter = new RateLimiter(env.WEB_RATE_LIMIT_MAX, env.WEB_RATE_LIMIT_WINDOW_SECONDS * 1000);
  }
  return limiter;
}

/**
 * The limiter for the READ endpoints: assets, assets/[ticker], health,
 * capabilities. A SEPARATE bucket from previews, deliberately - sharing one
 * would let a page that polls /api/health exhaust a visitor's preview budget,
 * and previews need to stay strict because they cost provider quotes.
 *
 * /api/live is NOT rate limited: it is the host's liveness probe and must
 * answer even while the app is shedding public traffic.
 */
export function readRateLimiter(): RateLimiter {
  if (readLimiter === undefined) {
    const env = serverEnv();
    readLimiter = new RateLimiter(
      env.WEB_READ_RATE_LIMIT_MAX,
      env.WEB_READ_RATE_LIMIT_WINDOW_SECONDS * 1000,
    );
  }
  return readLimiter;
}

/** How many proxies to count back through when identifying the client. */
export function trustedProxyHops(): number {
  return serverEnv().WEB_TRUSTED_PROXY_HOPS;
}

export interface RateLimitVerdict {
  /** Present when the request must be refused. Return it unchanged. */
  response?: NextResponse<ApiErrorBody> | undefined;
  /** Headers to attach to a successful response. */
  headers: Record<string, string>;
}

/**
 * Applies a per-IP limit and builds the honest refusal. Shared by every route
 * so the headers and the message cannot drift apart between endpoints.
 */
export function enforceRateLimit(
  request: Request,
  limiterFor: () => RateLimiter,
  what: string,
): RateLimitVerdict {
  const ip = clientIpOf(request.headers, trustedProxyHops());
  const verdict = limiterFor().check(ip);
  if (!verdict.allowed) {
    const response = apiError(
      "RATE_LIMITED",
      `Too many ${what} from this address. Try again in ${verdict.retryAfterSeconds}s.`,
    );
    // Retry-After is what a well-behaved client and most proxies actually read.
    response.headers.set("Retry-After", String(verdict.retryAfterSeconds));
    return { response, headers: {} };
  }
  return { headers: { "X-RateLimit-Remaining": String(verdict.remaining) } };
}

export function previewBudget(): ConcurrencyBudget {
  if (budget === undefined) {
    budget = new ConcurrencyBudget(serverEnv().WEB_MAX_CONCURRENT_PREVIEWS);
  }
  return budget;
}

export function previewFlight(): SingleFlight<PreviewDto> {
  return flight;
}

export { BudgetExhaustedError };

// --- capabilities ------------------------------------------------------------

export interface Capabilities {
  /** True only when verified IN THIS PROCESS during this request. */
  rwaDiscovery: boolean;
  liveQuotes: boolean;
  bestExecution: boolean;
  /** Hard false for this feature. Not "coming soon" - just not true. */
  transactionSimulation: false;
  mainnetExecution: false;
  agenticWallet: false;
  shareIntent: false;
  fundedGifting: false;
  /**
   * When the provider observation behind `liveQuotes` was actually taken. A
   * cached check is reported as cached rather than as current.
   */
  providerCheck: {
    checkedAt: string;
    ageSeconds: number;
    ttlSeconds: number;
    /** False when this response reused an earlier observation. */
    fresh: boolean;
  };
  /** Context a reader needs to judge the flags above. */
  details: {
    algorithmVersion: string;
    spendAssetSymbol: string;
    minAmount: string;
    maxAmount: string;
    amountBoundsAreProductDefaults: true;
    maxQuoteAgeSeconds: number;
    maxPriceImpactBps: string;
    maxReferenceDeviationBps: string;
    allowedAssetTypes: readonly number[];
    snapshotMaxAgeSeconds: number;
    /** Per-IP budgets, both product defaults. Separate buckets by design. */
    previewRateLimit: { max: number; windowSeconds: number };
    readRateLimit: { max: number; windowSeconds: number };
    rateLimitsAreProductDefaults: true;
    /** How many proxy hops the client IP is counted back through. */
    trustedProxyHops: number;
    /** The in-process limiter assumption (F003 section 4). */
    singleServerInstanceAssumed: true;
    executionNotLiveReason: string;
  };
}

/**
 * Truthful capability flags. `rwaDiscovery`, `liveQuotes` and `bestExecution`
 * are passed in from what this process actually just observed, never assumed:
 * the caller sets them from a real database read and a real provider response.
 */
export function capabilities(observed: {
  rwaDiscovery: boolean;
  liveQuotes: boolean;
  bestExecution: boolean;
  /** When the provider observation was taken. Omitted only if none was. */
  providerCheckedAt?: Date | undefined;
  providerCheckAgeSeconds?: number | undefined;
  providerCheckFresh?: boolean | undefined;
}): Capabilities {
  const env = serverEnv();
  const policy = previewPolicy();
  return {
    rwaDiscovery: observed.rwaDiscovery,
    liveQuotes: observed.liveQuotes,
    bestExecution: observed.bestExecution,
    transactionSimulation: false,
    mainnetExecution: false,
    agenticWallet: false,
    shareIntent: false,
    fundedGifting: false,
    providerCheck: {
      // The epoch is used when no observation exists, paired with ok:false
      // upstream. It is unmistakably not a real time, which is the point:
      // better than a plausible-looking timestamp for a check that never ran.
      checkedAt: (observed.providerCheckedAt ?? new Date(0)).toISOString(),
      ageSeconds: observed.providerCheckAgeSeconds ?? 0,
      ttlSeconds: env.WEB_PROVIDER_CHECK_TTL_SECONDS,
      fresh: observed.providerCheckFresh ?? false,
    },
    details: {
      algorithmVersion: ALGORITHM_VERSION,
      spendAssetSymbol: policy.spendAsset.symbol,
      minAmount: env.WEB_MIN_AMOUNT_USDT,
      maxAmount: env.WEB_MAX_AMOUNT_USDT,
      amountBoundsAreProductDefaults: true,
      maxQuoteAgeSeconds: policy.maxQuoteAgeSeconds,
      maxPriceImpactBps: policy.maxPriceImpactBps,
      maxReferenceDeviationBps: policy.maxReferenceDeviationBps,
      allowedAssetTypes: policy.allowedAssetTypes,
      snapshotMaxAgeSeconds: env.WEB_SNAPSHOT_MAX_AGE_SECONDS,
      previewRateLimit: {
        max: env.WEB_RATE_LIMIT_MAX,
        windowSeconds: env.WEB_RATE_LIMIT_WINDOW_SECONDS,
      },
      readRateLimit: {
        max: env.WEB_READ_RATE_LIMIT_MAX,
        windowSeconds: env.WEB_READ_RATE_LIMIT_WINDOW_SECONDS,
      },
      rateLimitsAreProductDefaults: true,
      trustedProxyHops: env.WEB_TRUSTED_PROXY_HOPS,
      singleServerInstanceAssumed: true,
      executionNotLiveReason:
        "Execution is not live yet. Nothing in this app signs, submits or broadcasts a transaction.",
    },
  };
}
