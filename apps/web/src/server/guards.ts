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

// --- cached check ------------------------------------------------------------

export interface CachedValue<T> {
  value: T;
  /** When the underlying work actually ran. */
  checkedAt: Date;
  /** Whole seconds since then. 0 means this request did the work. */
  ageSeconds: number;
  /** True when this request did the work rather than reading the cache. */
  fresh: boolean;
}

/**
 * One in-process cache with single-flight, for a check that is expensive and
 * shared. /api/health and /api/capabilities both need provider reachability,
 * and without this a page that calls both makes two authenticated provider
 * calls, and a refresh storm makes two per visitor.
 *
 * The RESULT is cached whether the check succeeded or failed, because the
 * result is the observation either way - a 60-second-old "the provider did not
 * answer" is still a real measurement, and every response carries `checkedAt`
 * and `ageSeconds` so a reader can see exactly how old it is rather than
 * having to assume it is current.
 *
 * A THROWN error is not cached: the entry is dropped and the error propagates,
 * so a transient bug cannot pin the app into a failing state for a whole TTL.
 */
export class SingleFlightCache<T> {
  private entry: { value: T; checkedAt: number } | undefined;
  private inFlight: Promise<T> | undefined;

  constructor(
    private readonly ttlMs: number,
    private readonly clock: Clock = systemClock,
  ) {}

  async get(fn: () => Promise<T>): Promise<CachedValue<T>> {
    const now = this.clock.now();
    if (this.entry !== undefined && now - this.entry.checkedAt <= this.ttlMs) {
      return this.describe(this.entry, now, false);
    }

    if (this.inFlight === undefined) {
      this.inFlight = (async () => fn())()
        .then((value) => {
          this.entry = { value, checkedAt: this.clock.now() };
          return value;
        })
        .finally(() => {
          this.inFlight = undefined;
        });
    }
    await this.inFlight;
    // `entry` is set by the branch above; a rejection never reaches here.
    const settled = this.entry as { value: T; checkedAt: number };
    return this.describe(settled, this.clock.now(), true);
  }

  private describe(
    entry: { value: T; checkedAt: number },
    now: number,
    fresh: boolean,
  ): CachedValue<T> {
    return {
      value: entry.value,
      checkedAt: new Date(entry.checkedAt),
      ageSeconds: Math.max(0, Math.floor((now - entry.checkedAt) / 1000)),
      fresh,
    };
  }

  /** Test-only, and used when configuration changes. Never called per request. */
  clear(): void {
    this.entry = undefined;
  }

  get ttlSeconds(): number {
    return Math.floor(this.ttlMs / 1000);
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

// --- client identity ---------------------------------------------------------

/** The shared bucket for requests whose origin cannot be established. */
export const UNKNOWN_CLIENT = "unknown";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * A conservative check that a token is an address rather than arbitrary text.
 * X-Forwarded-For is attacker-controlled, so an entry that is not an address
 * must not become a rate-limit bucket key - otherwise a client can mint a
 * fresh bucket per request just by varying the string.
 */
function normaliseIp(raw: string): string | undefined {
  let value = raw.trim();
  if (value === "") return undefined;

  // `[::1]:1234` - bracketed IPv6 with a port.
  const bracketed = /^\[([0-9a-fA-F:.]+)\](?::\d{1,5})?$/.exec(value);
  if (bracketed?.[1] !== undefined) value = bracketed[1];
  // `1.2.3.4:1234` - IPv4 with a port. Bare IPv6 also contains colons, so only
  // strip when exactly one colon is present and the left side is IPv4-shaped.
  else if ((value.match(/:/g) ?? []).length === 1 && IPV4.test(value.split(":")[0] ?? "")) {
    value = value.split(":")[0] ?? value;
  }

  const v4 = IPV4.exec(value);
  if (v4 !== null) {
    return v4.slice(1).every((octet) => Number(octet) <= 255) ? value : undefined;
  }
  // IPv6: hex groups, colons, and the IPv4-mapped tail form. Not a full
  // validator - just enough that free text cannot pass.
  if (/^[0-9a-fA-F:]*:[0-9a-fA-F:.]*$/.test(value) && /[0-9a-fA-F]/.test(value)) {
    return value.toLowerCase();
  }
  return undefined;
}

/**
 * The client IP, counted from the RIGHT of X-Forwarded-For.
 *
 * This used to take the first entry, which is wrong in a way that matters: a
 * client can send its own X-Forwarded-For, and the proxy APPENDS to it, so the
 * leftmost entry is whatever the client claimed. Rate limiting on that means
 * one visitor can have unlimited buckets.
 *
 * `trustedHops` is how many proxies sit between the internet and this server
 * (default 1: one platform router). The entry that proxy observed is the Nth
 * from the right, and everything to its left is unverifiable.
 *
 * A header that is absent, malformed, or shorter than the configured hop count
 * yields the shared UNKNOWN_CLIENT bucket: degrading into one shared bucket
 * limits too much, which is safe, whereas trusting a client-supplied value
 * limits nothing at all.
 */
export function clientIpOf(headers: Headers, trustedHops = 1): string {
  const hops = Number.isInteger(trustedHops) && trustedHops >= 1 ? trustedHops : 1;
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded !== null && forwarded.trim() !== "") {
    const entries = forwarded
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e !== "");
    // Too short means this request did not traverse the expected proxies, so
    // no entry in it can be trusted as the client.
    if (entries.length < hops) return UNKNOWN_CLIENT;
    return normaliseIp(entries[entries.length - hops] ?? "") ?? UNKNOWN_CLIENT;
  }

  // Only consulted when X-Forwarded-For is absent entirely - a proxy that sets
  // X-Real-IP alone. Still validated, for the same reason.
  const realIp = headers.get("x-real-ip");
  if (realIp !== null) return normaliseIp(realIp) ?? UNKNOWN_CLIENT;

  return UNKNOWN_CLIENT;
}
