import { describe, expect, it } from "vitest";
import {
  BudgetExhaustedError,
  ConcurrencyBudget,
  RateLimiter,
  SingleFlight,
  SingleFlightCache,
  clientIpOf,
  isPreviewExpired,
  type Clock,
} from "./guards";

/** A clock the test drives, so nothing here depends on wall-clock timing. */
function fakeClock(start = 1_000_000): Clock & { advance(ms: number): void } {
  let t = start;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows exactly `max` requests in a window and then refuses", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(3, 60_000, clock);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    const third = limiter.check("ip");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("reports a retry-after that actually frees the window", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(1, 60_000, clock);
    limiter.check("ip");
    const refused = limiter.check("ip");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);

    clock.advance(refused.retryAfterSeconds * 1000);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("never advertises a retry-after of 0 while refusing", () => {
    // A client told to retry after 0 seconds retries instantly and is refused
    // again, which reads as a broken app rather than a rate limit.
    const clock = fakeClock();
    const limiter = new RateLimiter(1, 500, clock);
    limiter.check("ip");
    clock.advance(499);
    const refused = limiter.check("ip");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("slides: an old hit stops counting once it leaves the window", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(2, 10_000, clock);
    limiter.check("ip");
    clock.advance(6_000);
    limiter.check("ip");
    expect(limiter.check("ip").allowed).toBe(false);
    clock.advance(4_001); // the first hit is now older than the window
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("buckets per key, so one visitor cannot block another", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(1, 60_000, clock);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(false);
    expect(limiter.check("2.2.2.2").allowed).toBe(true);
  });

  it("sweep drops buckets that have fully expired", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(5, 1_000, clock);
    limiter.check("a");
    limiter.check("b");
    expect(limiter.size).toBe(2);
    clock.advance(1_001);
    limiter.sweep();
    expect(limiter.size).toBe(0);
  });
});

describe("SingleFlight", () => {
  it("coalesces identical concurrent work into ONE call", async () => {
    const flight = new SingleFlight<number>();
    let calls = 0;
    let release: (v: number) => void = () => {};
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const fn = () => {
      calls += 1;
      return pending;
    };

    const a = flight.run("NVDA:100", fn);
    const b = flight.run("NVDA:100", fn);
    expect(calls).toBe(1);
    expect(flight.size).toBe(1);

    release(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
  });

  it("does NOT coalesce different keys", async () => {
    const flight = new SingleFlight<string>();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return "x";
    };
    await Promise.all([flight.run("NVDA:100", fn), flight.run("NVDA:200", fn)]);
    expect(calls).toBe(2);
  });

  it("is coalescing, NOT caching: the next request re-runs the work", async () => {
    // A cached preview would serve an expired quote, which F003 forbids.
    const flight = new SingleFlight<number>();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return calls;
    };
    expect(await flight.run("k", fn)).toBe(1);
    expect(flight.size).toBe(0);
    expect(await flight.run("k", fn)).toBe(2);
  });

  it("shares a rejection with every joiner and still clears the entry", async () => {
    const flight = new SingleFlight<number>();
    const boom = () => Promise.reject(new Error("provider down"));
    const a = flight.run("k", boom);
    const b = flight.run("k", boom);
    await expect(a).rejects.toThrow("provider down");
    await expect(b).rejects.toThrow("provider down");
    expect(flight.size).toBe(0);
  });

  it("clears the entry when the function throws SYNCHRONOUSLY", async () => {
    // A synchronous throw must not leave a poisoned entry that makes every
    // later request for that key fail forever.
    const flight = new SingleFlight<number>();
    await expect(
      flight.run("k", () => {
        throw new Error("sync");
      }),
    ).rejects.toThrow("sync");
    expect(flight.size).toBe(0);
    expect(await flight.run("k", async () => 1)).toBe(1);
  });
});

describe("ConcurrencyBudget", () => {
  it("rejects rather than queues once full", async () => {
    // Queuing would hold a request until its quote expired and then answer
    // with something stale; an honest "busy" now is better.
    const budget = new ConcurrencyBudget(2);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const a = budget.run(() => held);
    const b = budget.run(() => held);
    expect(budget.inUse).toBe(2);

    await expect(budget.run(async () => "third")).rejects.toBeInstanceOf(BudgetExhaustedError);

    release();
    await Promise.all([a, b]);
    expect(budget.inUse).toBe(0);
  });

  it("frees a slot even when the work throws", async () => {
    const budget = new ConcurrencyBudget(1);
    await expect(budget.run(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(budget.inUse).toBe(0);
    expect(await budget.run(async () => "ok")).toBe("ok");
  });

  it("carries the BUSY code the API maps to a 503", () => {
    const error = new BudgetExhaustedError(2);
    expect(error.code).toBe("BUSY");
    expect(error.message).toContain("2");
  });

  it("reports its capacity so capabilities can be honest about it", () => {
    expect(new ConcurrencyBudget(2).capacity).toBe(2);
  });
});

describe("isPreviewExpired", () => {
  const now = new Date("2026-10-02T12:00:30.000Z");

  it("is fresh inside the window", () => {
    expect(isPreviewExpired("2026-10-02T12:00:15.000Z", 20, now)).toBe(false);
  });

  it("treats exactly-at-the-limit as still fresh", () => {
    expect(isPreviewExpired("2026-10-02T12:00:10.000Z", 20, now)).toBe(false);
  });

  it("expires one second past the limit", () => {
    expect(isPreviewExpired("2026-10-02T12:00:09.000Z", 20, now)).toBe(true);
  });

  it("fails CLOSED on a missing or unparseable timestamp", () => {
    // Not knowing the age is not the same as being fresh.
    expect(isPreviewExpired(undefined, 20, now)).toBe(true);
    expect(isPreviewExpired("not-a-date", 20, now)).toBe(true);
  });
});

describe("clientIpOf (trusted proxy hops)", () => {
  const xff = (value: string) => new Headers({ "x-forwarded-for": value });

  it("takes the Nth entry FROM THE RIGHT, not the first", () => {
    // One proxy: the entry it observed is the last one. Everything to its left
    // was supplied by the client.
    expect(clientIpOf(xff("203.0.113.7, 10.0.0.1, 198.51.100.9"), 1)).toBe("198.51.100.9");
    expect(clientIpOf(xff("203.0.113.7, 10.0.0.1, 198.51.100.9"), 2)).toBe("10.0.0.1");
    expect(clientIpOf(xff("203.0.113.7, 10.0.0.1, 198.51.100.9"), 3)).toBe("203.0.113.7");
  });

  it("EXTRA LEADING ENTRIES CANNOT CHANGE THE BUCKET", () => {
    // The attack this replaces: a client sends its own X-Forwarded-For, the
    // proxy appends to it, and a limiter keyed on the leftmost entry gives
    // that client a fresh bucket on every request.
    const real = clientIpOf(xff("198.51.100.9"), 1);
    for (const spoofed of [
      "1.2.3.4, 198.51.100.9",
      "5.6.7.8, 1.2.3.4, 198.51.100.9",
      "not-an-ip, 198.51.100.9",
      "198.51.100.1, 198.51.100.2, 198.51.100.3, 198.51.100.9",
      "::1, 198.51.100.9",
    ]) {
      expect(clientIpOf(xff(spoofed), 1), spoofed).toBe(real);
    }
  });

  it("a client cannot escape its bucket by varying what it prepends", () => {
    const buckets = new Set(
      [
        "198.51.100.9",
        "a, 198.51.100.9",
        "b, c, 198.51.100.9",
        "999.999.999.999, 198.51.100.9",
      ].map((v) => clientIpOf(xff(v), 1)),
    );
    expect(buckets.size).toBe(1);
  });

  it("uses the SHARED bucket when the header is shorter than the hop count", () => {
    // Fewer entries than expected means the request did not traverse the
    // configured proxies, so nothing in it identifies the client.
    expect(clientIpOf(xff("198.51.100.9"), 2)).toBe("unknown");
    expect(clientIpOf(xff("10.0.0.1, 198.51.100.9"), 3)).toBe("unknown");
  });

  it("uses the SHARED bucket when the chosen entry is not an address", () => {
    // Free text must never become a bucket key - that is a fresh bucket per
    // request for anyone who wants one.
    expect(clientIpOf(xff("10.0.0.1, haxx"), 1)).toBe("unknown");
    expect(clientIpOf(xff("10.0.0.1, 300.1.2.3"), 1)).toBe("unknown");
    expect(clientIpOf(xff("10.0.0.1, 1.2.3"), 1)).toBe("unknown");
    expect(clientIpOf(xff("10.0.0.1, <script>"), 1)).toBe("unknown");
  });

  it("tolerates whitespace and empty entries without shifting the count", () => {
    expect(clientIpOf(xff("  10.0.0.1 ,, 198.51.100.9  "), 1)).toBe("198.51.100.9");
    expect(clientIpOf(xff("  10.0.0.1 ,, 198.51.100.9  "), 2)).toBe("10.0.0.1");
  });

  it("accepts IPv6 and strips a port", () => {
    expect(clientIpOf(xff("2001:DB8::1"), 1)).toBe("2001:db8::1");
    expect(clientIpOf(xff("[2001:db8::1]:443"), 1)).toBe("2001:db8::1");
    expect(clientIpOf(xff("198.51.100.9:54321"), 1)).toBe("198.51.100.9");
  });

  it("defaults to one hop, and ignores a nonsense hop count", () => {
    expect(clientIpOf(xff("1.2.3.4, 198.51.100.9"))).toBe("198.51.100.9");
    expect(clientIpOf(xff("1.2.3.4, 198.51.100.9"), 0)).toBe("198.51.100.9");
    expect(clientIpOf(xff("1.2.3.4, 198.51.100.9"), -5)).toBe("198.51.100.9");
    expect(clientIpOf(xff("1.2.3.4, 198.51.100.9"), 1.5)).toBe("198.51.100.9");
  });

  it("consults x-real-ip ONLY when x-forwarded-for is absent", () => {
    expect(clientIpOf(new Headers({ "x-real-ip": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    // Present but unusable: the fallback must not become a way around the
    // hop count, so this stays in the shared bucket.
    expect(
      clientIpOf(new Headers({ "x-forwarded-for": "haxx", "x-real-ip": "203.0.113.9" }), 1),
    ).toBe("unknown");
    expect(clientIpOf(new Headers({ "x-real-ip": "nonsense" }), 1)).toBe("unknown");
  });

  it("falls back to a SHARED bucket rather than letting everything through", () => {
    expect(clientIpOf(new Headers(), 1)).toBe("unknown");
    expect(clientIpOf(new Headers({ "x-forwarded-for": "   " }), 1)).toBe("unknown");
    expect(clientIpOf(new Headers({ "x-forwarded-for": ",,," }), 1)).toBe("unknown");
  });
});

describe("SingleFlightCache", () => {
  it("runs the work once and reuses it inside the TTL", async () => {
    const clock = fakeClock();
    const cache = new SingleFlightCache<number>(60_000, clock);
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return calls;
    };

    const first = await cache.get(fn);
    expect(first.value).toBe(1);
    expect(first.fresh).toBe(true);
    expect(first.ageSeconds).toBe(0);

    clock.advance(30_000);
    const second = await cache.get(fn);
    expect(calls).toBe(1);
    expect(second.value).toBe(1);
    expect(second.fresh).toBe(false);
    expect(second.ageSeconds).toBe(30);
  });

  it("re-runs once the TTL has passed", async () => {
    const clock = fakeClock();
    const cache = new SingleFlightCache<number>(60_000, clock);
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return calls;
    };
    await cache.get(fn);
    clock.advance(60_001);
    const again = await cache.get(fn);
    expect(calls).toBe(2);
    expect(again.value).toBe(2);
    expect(again.ageSeconds).toBe(0);
    expect(again.fresh).toBe(true);
  });

  it("treats exactly the TTL as still valid", async () => {
    const clock = fakeClock();
    const cache = new SingleFlightCache<number>(60_000, clock);
    let calls = 0;
    await cache.get(async () => ++calls);
    clock.advance(60_000);
    await cache.get(async () => ++calls);
    expect(calls).toBe(1);
  });

  it("COALESCES concurrent callers into one run", async () => {
    // This is the point: /api/health and /api/capabilities on the same page
    // must not make two authenticated provider calls.
    const cache = new SingleFlightCache<string>(60_000, fakeClock());
    let calls = 0;
    let release: (v: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fn = () => {
      calls += 1;
      return pending;
    };

    const a = cache.get(fn);
    const b = cache.get(fn);
    expect(calls).toBe(1);
    release("ok");
    expect((await a).value).toBe("ok");
    expect((await b).value).toBe("ok");
    expect(calls).toBe(1);
  });

  it("caches a FAILED observation too, and reports its age", async () => {
    // A provider that did not answer is a real measurement. Re-checking it on
    // every request is exactly the stampede this cache exists to prevent; the
    // age is what keeps the answer honest.
    const clock = fakeClock();
    const cache = new SingleFlightCache<{ ok: boolean }>(60_000, clock);
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return { ok: false };
    };
    await cache.get(fn);
    clock.advance(10_000);
    const second = await cache.get(fn);
    expect(calls).toBe(1);
    expect(second.value.ok).toBe(false);
    expect(second.ageSeconds).toBe(10);
  });

  it("does NOT cache a thrown error, and recovers on the next call", async () => {
    // A transient bug must not pin the app into a failing state for a TTL.
    const cache = new SingleFlightCache<number>(60_000, fakeClock());
    await expect(cache.get(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect((await cache.get(async () => 7)).value).toBe(7);
  });

  it("clear() forces the next call to measure again", async () => {
    const cache = new SingleFlightCache<number>(60_000, fakeClock());
    let calls = 0;
    await cache.get(async () => ++calls);
    cache.clear();
    await cache.get(async () => ++calls);
    expect(calls).toBe(2);
  });

  it("reports its TTL in seconds", () => {
    expect(new SingleFlightCache<number>(60_000).ttlSeconds).toBe(60);
  });
});
