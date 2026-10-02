import { describe, expect, it } from "vitest";
import {
  BudgetExhaustedError,
  ConcurrencyBudget,
  RateLimiter,
  SingleFlight,
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

describe("clientIpOf", () => {
  it("takes the FIRST x-forwarded-for entry (the client, not the proxy)", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(clientIpOf(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIpOf(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to a SHARED bucket rather than letting everything through", () => {
    // With no header, an empty key per request would disable the limiter
    // entirely; one shared bucket degrades safely instead.
    expect(clientIpOf(new Headers())).toBe("unknown");
    expect(clientIpOf(new Headers({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});
