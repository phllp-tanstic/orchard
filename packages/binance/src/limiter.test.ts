import { describe, expect, it } from "vitest";
import { RateLimiter, type Clock } from "./limiter.js";

/** Deterministic fake clock: `sleep` advances virtual time instead of waiting. */
function fakeClock(startMs = 0): Clock & { advance(ms: number): void } {
  let now = startMs;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows up to perEndpointLimit requests per endpoint within the window, then blocks", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ perEndpointLimit: 5, perEndpointWindowMs: 1_000, clock });

    for (let i = 0; i < 5; i++) {
      expect(limiter.waitTimeMs("tokens", clock.now())).toBe(0);
      await limiter.acquire("tokens");
    }
    // 6th call within the same 1s window must wait.
    expect(limiter.waitTimeMs("tokens", clock.now())).toBeGreaterThan(0);
  });

  it("frees an endpoint slot once its window has elapsed", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ perEndpointLimit: 5, perEndpointWindowMs: 1_000, clock });

    for (let i = 0; i < 5; i++) await limiter.acquire("tokens");
    expect(limiter.waitTimeMs("tokens", clock.now())).toBeGreaterThan(0);

    clock.advance(1_001);
    expect(limiter.waitTimeMs("tokens", clock.now())).toBe(0);
  });

  it("keeps separate windows per endpoint", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ perEndpointLimit: 5, perEndpointWindowMs: 1_000, clock });

    for (let i = 0; i < 5; i++) await limiter.acquire("tokens");
    // A different endpoint is unaffected.
    expect(limiter.waitTimeMs("platforms", clock.now())).toBe(0);
  });

  it("enforces the per-key ceiling across all endpoints", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      perEndpointLimit: 1_000, // effectively disable the per-endpoint cap for this test
      perEndpointWindowMs: 1_000,
      perKeyLimit: 3,
      perKeyWindowMs: 60_000,
      clock,
    });

    await limiter.acquire("a");
    await limiter.acquire("b");
    await limiter.acquire("c");
    // 4th call anywhere, still within the 60s key window, must wait.
    expect(limiter.waitTimeMs("d", clock.now())).toBeGreaterThan(0);
  });

  it("acquire() blocks via the injected clock's sleep rather than a real timer, and returns once a slot frees", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ perEndpointLimit: 1, perEndpointWindowMs: 1_000, clock });

    await limiter.acquire("tokens");
    const start = clock.now();
    await limiter.acquire("tokens"); // must internally advance the fake clock to become unblocked
    expect(clock.now()).toBeGreaterThan(start);
  });
});
