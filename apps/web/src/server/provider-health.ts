import "server-only";
import { BinanceWeb3Client } from "@orchard/binance";
import { serverEnv } from "./env";
import { SingleFlightCache, type CachedValue } from "./guards";

/**
 * Provider reachability, measured once and shared (F003 hardening item 1).
 *
 * /api/health and /api/capabilities both need this, and before the cache a
 * page that read both made TWO authenticated provider calls. Single-flight
 * also means a refresh storm costs one call rather than one per visitor, which
 * matters because the provider limit is per key and this app runs one
 * instance.
 *
 * The check itself is one read-only /rwa/platforms call - the cheapest
 * authenticated endpoint - so it never competes with the quote budget.
 *
 * Every consumer receives `checkedAt` and `ageSeconds` with the result, so a
 * cached observation is reported as what it is. Nothing here reports "healthy"
 * without a provider response behind it.
 */

export interface ProviderReachability {
  ok: boolean;
  /** The provider's envelope code, or a sanitised error summary. Never a secret. */
  detail: string;
  /** How long the provider took, when it answered. */
  latencyMs: number;
}

/** The endpoint used for the check. Named here so the no-signing guard can see it. */
const PLATFORMS_PATH = "/api/v1/dex/market/rwa/platforms";

async function measureProvider(): Promise<ProviderReachability> {
  const started = Date.now();
  try {
    const env = serverEnv();
    const client = new BinanceWeb3Client({
      apiKey: env.BINANCE_WEB3_API_KEY,
      apiSecret: env.BINANCE_WEB3_API_SECRET,
      baseUrl: env.BINANCE_WEB3_BASE_URL,
    });
    const res = await client.request<unknown>({ method: "GET", path: PLATFORMS_PATH });
    const code = String(res.envelope.code);
    return { ok: code === "0", detail: `code ${code}`, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      // Truncated and taken from the message only. The environment error names
      // variables without values, and provider errors carry no credential, but
      // the cap keeps an unexpected message from becoming a response body.
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
      latencyMs: Date.now() - started,
    };
  }
}

let cache: SingleFlightCache<ProviderReachability> | undefined;
let cacheTtlSeconds: number | undefined;

function providerCache(): SingleFlightCache<ProviderReachability> {
  const ttl = serverEnv().WEB_PROVIDER_CHECK_TTL_SECONDS;
  // Rebuilt if the configured TTL changes, which only happens between test
  // cases - a running process reads the environment once.
  if (cache === undefined || cacheTtlSeconds !== ttl) {
    cache = new SingleFlightCache<ProviderReachability>(ttl * 1000);
    cacheTtlSeconds = ttl;
  }
  return cache;
}

/** The shared, cached provider check. Both API routes go through this. */
export async function providerReachability(): Promise<CachedValue<ProviderReachability>> {
  return providerCache().get(measureProvider);
}

/** Test-only. Drops the cached observation so the next call measures again. */
export function resetProviderHealthForTests(): void {
  cache = undefined;
  cacheTtlSeconds = undefined;
}
