import "server-only";
import { NextResponse } from "next/server";
import { ALGORITHM_VERSION } from "@orchard/execution";
import { serverEnv } from "./env";
import { previewPolicy } from "./preview";
import { BudgetExhaustedError, ConcurrencyBudget, RateLimiter, SingleFlight } from "./guards";
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
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

// --- process-wide guards -----------------------------------------------------

let limiter: RateLimiter | undefined;
let budget: ConcurrencyBudget | undefined;
const flight = new SingleFlight<PreviewDto>();

export function previewRateLimiter(): RateLimiter {
  if (limiter === undefined) {
    const env = serverEnv();
    limiter = new RateLimiter(env.WEB_RATE_LIMIT_MAX, env.WEB_RATE_LIMIT_WINDOW_SECONDS * 1000);
  }
  return limiter;
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
      singleServerInstanceAssumed: true,
      executionNotLiveReason:
        "Execution is not live yet. Nothing in this app signs, submits or broadcasts a transaction.",
    },
  };
}
