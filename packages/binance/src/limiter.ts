/**
 * Client-side limiter kept strictly below the documented Binance Web3 API
 * limits: 5 requests/second per endpoint, 1200 requests/60s per API key.
 * Pure sliding-window token accounting with an injectable clock/sleep so
 * tests never depend on real wall-clock time.
 */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface RateLimiterOptions {
  /** Max requests per endpoint within perEndpointWindowMs. Default 5. */
  perEndpointLimit?: number;
  /** Window for the per-endpoint limit, ms. Default 1000 (5 rps). */
  perEndpointWindowMs?: number;
  /** Max requests per API key within perKeyWindowMs. Default 1200. */
  perKeyLimit?: number;
  /** Window for the per-key limit, ms. Default 60_000 (1200/60s). */
  perKeyWindowMs?: number;
  clock?: Clock;
}

export class RateLimiter {
  private readonly perEndpointLimit: number;
  private readonly perEndpointWindowMs: number;
  private readonly perKeyLimit: number;
  private readonly perKeyWindowMs: number;
  private readonly clock: Clock;

  private readonly endpointTimestamps = new Map<string, number[]>();
  private keyTimestamps: number[] = [];

  constructor(options: RateLimiterOptions = {}) {
    this.perEndpointLimit = options.perEndpointLimit ?? 5;
    this.perEndpointWindowMs = options.perEndpointWindowMs ?? 1_000;
    this.perKeyLimit = options.perKeyLimit ?? 1_200;
    this.perKeyWindowMs = options.perKeyWindowMs ?? 60_000;
    this.clock = options.clock ?? systemClock;
  }

  /** Blocks (via the injected clock's sleep) until a slot is available, then records the call. */
  async acquire(endpoint: string): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      const waitMs = this.waitTimeMs(endpoint, now);
      if (waitMs <= 0) {
        this.record(endpoint, now);
        return;
      }
      await this.clock.sleep(waitMs);
    }
  }

  /** Non-blocking check: ms to wait before `endpoint` would be allowed, 0 if allowed now. */
  waitTimeMs(endpoint: string, now: number = this.clock.now()): number {
    const endpointTimes = this.prune(
      this.endpointTimestamps.get(endpoint) ?? [],
      now,
      this.perEndpointWindowMs,
    );
    const keyTimes = this.prune(this.keyTimestamps, now, this.perKeyWindowMs);

    let waitForEndpoint = 0;
    if (endpointTimes.length >= this.perEndpointLimit) {
      const oldest = endpointTimes[0]!;
      waitForEndpoint = oldest + this.perEndpointWindowMs - now;
    }

    let waitForKey = 0;
    if (keyTimes.length >= this.perKeyLimit) {
      const oldest = keyTimes[0]!;
      waitForKey = oldest + this.perKeyWindowMs - now;
    }

    return Math.max(0, waitForEndpoint, waitForKey);
  }

  private record(endpoint: string, now: number): void {
    const endpointTimes = this.prune(
      this.endpointTimestamps.get(endpoint) ?? [],
      now,
      this.perEndpointWindowMs,
    );
    endpointTimes.push(now);
    this.endpointTimestamps.set(endpoint, endpointTimes);

    this.keyTimestamps = this.prune(this.keyTimestamps, now, this.perKeyWindowMs);
    this.keyTimestamps.push(now);
  }

  private prune(timestamps: number[], now: number, windowMs: number): number[] {
    return timestamps.filter((t) => now - t < windowMs);
  }
}
