import "server-only";

/**
 * Request protection for the BFF (F003 T2): a per-IP rate limit,
 * single-flight coalescing of identical concurrent requests, and a
 * process-wide concurrency budget so public traffic cannot exhaust the
 * provider's limits.
 *
 * All three are IN-PROCESS and deliberately so: F003 section 4 requires
 * exactly one server instance, because the provider limit is per key and a
 * shared limiter across instances is a separate decision. Running more than
 * one instance would silently multiply the budget, which is why the
 * capabilities endpoint reports the instance assumption.
 *
 * The provider allows 5 requests/s per endpoint and 1200 per 60s per key, and
 * one preview costs one quote PER representation (two for a typical ticker), so
 * the default budget of 2 concurrent previews keeps the app far below the cap
 * even before the client's own limiter.
 */

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

// --- per-IP rate limit -------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Seconds until the window frees up. 0 when allowed. */
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: Clock = systemClock,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.clock.now();
    const kept = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (kept.length >= this.max) {
      const oldest = kept[0] ?? now;
      this.hits.set(key, kept);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
      };
    }
    kept.push(now);
    this.hits.set(key, kept);
    return { allowed: true, remaining: this.max - kept.length, retryAfterSeconds: 0 };
  }

  /** Drops empty buckets so a long-lived process does not grow unbounded. */
  sweep(): void {
    const now = this.clock.now();
    for (const [key, times] of this.hits) {
      const kept = times.filter((t) => now - t < this.windowMs);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

// --- single flight -----------------------------------------------------------

/**
 * Coalesces identical CONCURRENT work. Two visitors asking for the same ticker
 * and amount at the same moment produce one provider call set and share the
 * result; the entry is dropped as soon as it settles, so the next request gets
 * a fresh quote rather than a cached one. This is coalescing, not caching -
 * a stale preview must never be served (F003 T2).
 */
export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;
    const promise = (async () => fn())().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.inFlight.size;
  }
}

// --- concurrency budget ------------------------------------------------------

export class BudgetExhaustedError extends Error {
  readonly code = "BUSY";
  constructor(limit: number) {
    super(`concurrency budget of ${limit} is fully in use`);
    this.name = "BudgetExhaustedError";
  }
}

/**
 * A hard ceiling on work in flight. It REJECTS rather than queues: a queued
 * request would sit until its quote expired and then serve something stale, so
 * an honest "busy" now is better than a misleading answer later (F003 T2).
 */
export class ConcurrencyBudget {
  private active = 0;

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) throw new BudgetExhaustedError(this.limit);
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
    }
  }

  get inUse(): number {
    return this.active;
  }

  get capacity(): number {
    return this.limit;
  }
}

// --- freshness ---------------------------------------------------------------

/**
 * True when a preview must be recomputed rather than served. Checks the OLDEST
 * quote: a result is only as fresh as its weakest leg.
 */
export function isPreviewExpired(
  quotedAtIso: string | undefined,
  maxQuoteAgeSeconds: number,
  now: Date,
): boolean {
  if (quotedAtIso === undefined) return true;
  const quoted = new Date(quotedAtIso).getTime();
  if (!Number.isFinite(quoted)) return true;
  return (now.getTime() - quoted) / 1000 > maxQuoteAgeSeconds;
}

/**
 * The client IP, from the proxy headers a single Node server behind a platform
 * router normally sees. Falls back to a constant so the limiter still works
 * (shared bucket) rather than silently letting everything through when no
 * header is present.
 */
export function clientIpOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.trim() !== "") {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first !== "") return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}
