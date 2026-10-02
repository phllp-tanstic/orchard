import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/health, /api/live and /api/capabilities (F003 hardening items 1 and 2).
 *
 * The PROVIDER is mocked at its client boundary - `BinanceWeb3Client.request`
 * - and the database at the pool boundary. Everything between, including the
 * shared cache and the single-flight, is the real code. That is the seam that
 * matters here: the whole point of these tests is that two endpoints make ONE
 * provider call between them, which is only observable by counting calls at
 * that boundary.
 *
 * Test-only mocks. The routes themselves have no fixture and no fallback.
 */

const providerRequest = vi.fn();
vi.mock("@orchard/binance", () => ({
  BinanceWeb3Client: class {
    request = providerRequest;
  },
}));

const dbQuery = vi.fn();
vi.mock("@/server/db", () => ({
  db: () => ({ query: dbQuery }),
  closeDbForTests: async () => {},
}));

const snapshotMeta = vi.fn();
vi.mock("@/server/universe", () => ({ snapshotMeta }));

const BASE_ENV: Record<string, string> = {
  BINANCE_WEB3_API_KEY: "(test placeholder, not a key)",
  BINANCE_WEB3_API_SECRET: "(test placeholder, not a secret)",
  BINANCE_WEB3_BASE_URL: "https://web3.binance.com/test",
  TARGET_BINANCE_CHAIN_ID: "56",
  ORCHARD_APP_DATABASE_URL: "postgres://orchard_app:x@127.0.0.1:5432/orchard_test",
  EVIDENCE_REDACTION_SALT: "(test placeholder, not a salt)",
  WEB_READ_RATE_LIMIT_MAX: "100",
  WEB_READ_RATE_LIMIT_WINDOW_SECONDS: "60",
  WEB_PROVIDER_CHECK_TTL_SECONDS: "60",
  WEB_TRUSTED_PROXY_HOPS: "1",
  NODE_ENV: "test",
};

const FRESH_SNAPSHOT = {
  snapshotAt: "2026-10-02T10:00:00.000Z",
  probeRunId: "run-1",
  ageSeconds: 600,
  stale: false,
  maxAgeSeconds: 21600,
  underlyingCount: 445,
  representationCount: 488,
};

let savedEnv: NodeJS.ProcessEnv;

/** Loads the routes with a fresh module graph, so caches and limiters start empty. */
async function load(overrides: Record<string, string> = {}): Promise<{
  health: (r: NextRequest) => Promise<Response>;
  capabilities: (r: NextRequest) => Promise<Response>;
  live: () => Response;
}> {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) process.env[k] = v;
  const health = await import("./route");
  const capabilities = await import("../capabilities/route");
  const live = await import("../live/route");
  return {
    health: health.GET as (r: NextRequest) => Promise<Response>,
    capabilities: capabilities.GET as (r: NextRequest) => Promise<Response>,
    live: live.GET as () => Response,
  };
}

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/health", {
    headers: { "x-forwarded-for": "198.51.100.9", ...headers },
  });
}

beforeEach(() => {
  savedEnv = { ...process.env };
  providerRequest.mockReset();
  dbQuery.mockReset();
  snapshotMeta.mockReset();
  providerRequest.mockResolvedValue({ envelope: { code: 0 } });
  dbQuery.mockResolvedValue({ rows: [{ "1": 1 }] });
  snapshotMeta.mockResolvedValue(FRESH_SNAPSHOT);
});

afterEach(() => {
  process.env = savedEnv;
  vi.restoreAllMocks();
});

describe("GET /api/live", () => {
  it("answers 200 and touches NOTHING", async () => {
    // A liveness probe that called the provider would spend the per-key budget
    // on polling, forever. One that called the database would restart the app
    // over somebody else's outage.
    const { live } = await load();
    const response = live();
    expect(response.status).toBe(200);
    expect(providerRequest).not.toHaveBeenCalled();
    expect(dbQuery).not.toHaveBeenCalled();
    expect(snapshotMeta).not.toHaveBeenCalled();
    const body = (await response.json()) as { live: boolean; note: string };
    expect(body.live).toBe(true);
    expect(body.note).toMatch(/checks no dependency/);
  });

  it("is not cacheable, and is not rate limited", async () => {
    const { live } = await load({ WEB_READ_RATE_LIMIT_MAX: "1" });
    expect(live().headers.get("cache-control")).toBe("no-store");
    // Far more than the read budget: the host must be able to probe freely
    // even while public traffic is being shed.
    for (let i = 0; i < 20; i += 1) expect(live().status).toBe(200);
  });

  it("stays 200 even when every dependency is down", async () => {
    const { live } = await load();
    providerRequest.mockRejectedValue(new Error("provider down"));
    dbQuery.mockRejectedValue(new Error("db down"));
    expect(live().status).toBe(200);
  });
});

describe("GET /api/health", () => {
  it("reports 200 with every check and a checkedAt per check", async () => {
    const { health } = await load();
    const response = await health(req());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      checkedAt: string;
      ageSeconds: number;
      checks: Record<string, { ok: boolean; checkedAt?: string; ageSeconds?: number }>;
    };
    expect(body.ok).toBe(true);
    expect(body.ageSeconds).toBe(0);
    expect(Date.parse(body.checkedAt)).toBeGreaterThan(0);
    for (const name of ["database", "provider", "universe"]) {
      expect(body.checks[name]?.ok, name).toBe(true);
      expect(Date.parse(body.checks[name]?.checkedAt ?? ""), name).toBeGreaterThan(0);
    }
  });

  it("answers 503 when a dependency is down, so a balancer can act on it", async () => {
    const { health } = await load();
    dbQuery.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    const response = await health(req());
    expect(response.status).toBe(503);
    const text = JSON.stringify(await response.json());
    // The verdict is reported; the connection detail is not.
    expect(text).toContain('"ok":false');
    expect(text).not.toContain("10.0.0.1");
    expect(text).not.toContain("ECONNREFUSED");
  });

  it("answers 503 when the provider does not answer", async () => {
    const { health } = await load();
    providerRequest.mockRejectedValue(new Error("socket hang up"));
    const response = await health(req());
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      checks: Record<string, { ok: boolean; detail?: string }>;
    };
    expect(body.checks["provider"]?.ok).toBe(false);
    expect(body.checks["provider"]?.detail).toContain("socket hang up");
  });

  it("treats a non-zero provider code as NOT reachable", async () => {
    const { health } = await load();
    providerRequest.mockResolvedValue({ envelope: { code: 40101 } });
    const body = (await (await health(req())).json()) as {
      checks: Record<string, { ok: boolean; detail?: string }>;
    };
    expect(body.checks["provider"]?.ok).toBe(false);
    expect(body.checks["provider"]?.detail).toBe("code 40101");
  });

  it("reports a STALE snapshot as not ok while still serving the numbers", async () => {
    const { health } = await load();
    snapshotMeta.mockResolvedValue({ ...FRESH_SNAPSHOT, ageSeconds: 99999, stale: true });
    const response = await health(req());
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      checks: Record<string, { ok: boolean; detail?: string }>;
      snapshot: { underlyingCount: number } | null;
    };
    expect(body.checks["universe"]?.ok).toBe(false);
    expect(body.snapshot?.underlyingCount).toBe(445);
  });

  it("says plainly when no snapshot has been built", async () => {
    const { health } = await load();
    snapshotMeta.mockResolvedValue({ ...FRESH_SNAPSHOT, snapshotAt: null, ageSeconds: null });
    const body = (await (await health(req())).json()) as {
      checks: Record<string, { ok: boolean; detail?: string }>;
    };
    expect(body.checks["universe"]?.detail).toContain("no COMPLETE snapshot run exists yet");
  });

  it("skips the snapshot check when the database is unreachable", async () => {
    // Querying a dead pool twice to report the same outage adds nothing.
    const { health } = await load();
    dbQuery.mockRejectedValue(new Error("down"));
    const body = (await (await health(req())).json()) as { checks: Record<string, unknown> };
    expect(body.checks["universe"]).toBeUndefined();
  });

  it("is not cacheable", async () => {
    const { health } = await load();
    expect((await health(req())).headers.get("cache-control")).toBe("no-store");
  });
});

describe("the shared provider check", () => {
  it("costs ONE provider call across health and capabilities", async () => {
    const { health, capabilities } = await load();
    await health(req());
    await capabilities(req());
    expect(providerRequest).toHaveBeenCalledTimes(1);
  });

  it("reuses the observation and reports its AGE rather than claiming it is fresh", async () => {
    const { health } = await load();
    const first = (await (await health(req())).json()) as {
      checks: Record<string, { checkedAt?: string; ageSeconds?: number }>;
    };
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date(Date.now() + 30_000));
    const second = (await (await health(req())).json()) as {
      checks: Record<string, { checkedAt?: string; ageSeconds?: number }>;
    };
    vi.useRealTimers();

    expect(providerRequest).toHaveBeenCalledTimes(1);
    // Same observation, explicitly older.
    expect(second.checks["provider"]?.checkedAt).toBe(first.checks["provider"]?.checkedAt);
    expect(second.checks["provider"]?.ageSeconds).toBeGreaterThanOrEqual(29);
  });

  it("re-measures once the TTL has passed", async () => {
    const { health } = await load({ WEB_PROVIDER_CHECK_TTL_SECONDS: "1" });
    await health(req());
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date(Date.now() + 2_000));
    await health(req());
    vi.useRealTimers();
    expect(providerRequest).toHaveBeenCalledTimes(2);
  });

  it("COALESCES concurrent callers into one provider call", async () => {
    const { health, capabilities } = await load();
    let release: (v: unknown) => void = () => {};
    providerRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const a = health(req());
    const b = capabilities(req());
    // Let both reach the provider boundary.
    for (let i = 0; i < 50 && providerRequest.mock.calls.length === 0; i += 1) {
      await new Promise((r) => setImmediate(r));
    }
    release({ envelope: { code: 0 } });
    await Promise.all([a, b]);
    expect(providerRequest).toHaveBeenCalledTimes(1);
  });

  it("caches a FAILED check too, so an outage cannot become a call storm", async () => {
    const { health, capabilities } = await load();
    providerRequest.mockRejectedValue(new Error("provider down"));
    await health(req());
    await capabilities(req());
    await health(req());
    expect(providerRequest).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/capabilities", () => {
  it("reports the provider observation's age alongside the flags", async () => {
    const { capabilities } = await load();
    const body = (await (await capabilities(req())).json()) as {
      liveQuotes: boolean;
      rwaDiscovery: boolean;
      bestExecution: boolean;
      providerCheck: { checkedAt: string; ageSeconds: number; ttlSeconds: number; fresh: boolean };
    };
    expect(body.liveQuotes).toBe(true);
    expect(body.rwaDiscovery).toBe(true);
    expect(body.bestExecution).toBe(true);
    expect(body.providerCheck.fresh).toBe(true);
    expect(body.providerCheck.ageSeconds).toBe(0);
    expect(body.providerCheck.ttlSeconds).toBe(60);
    expect(Date.parse(body.providerCheck.checkedAt)).toBeGreaterThan(0);
  });

  it("marks a reused observation as NOT fresh", async () => {
    const { health, capabilities } = await load();
    await health(req());
    const body = (await (await capabilities(req())).json()) as {
      providerCheck: { fresh: boolean };
    };
    expect(body.providerCheck.fresh).toBe(false);
  });

  it("withholds bestExecution when either half is missing", async () => {
    const { capabilities } = await load();
    snapshotMeta.mockResolvedValue({ ...FRESH_SNAPSHOT, underlyingCount: 0 });
    const body = (await (await capabilities(req())).json()) as {
      rwaDiscovery: boolean;
      liveQuotes: boolean;
      bestExecution: boolean;
    };
    expect(body.rwaDiscovery).toBe(false);
    expect(body.liveQuotes).toBe(true);
    expect(body.bestExecution).toBe(false);
  });

  it("publishes the rate limits as PRODUCT DEFAULTS", async () => {
    const { capabilities } = await load({
      WEB_RATE_LIMIT_MAX: "7",
      WEB_READ_RATE_LIMIT_MAX: "77",
      WEB_TRUSTED_PROXY_HOPS: "2",
    });
    const body = (await (await capabilities(req())).json()) as {
      details: {
        previewRateLimit: { max: number; windowSeconds: number };
        readRateLimit: { max: number; windowSeconds: number };
        rateLimitsAreProductDefaults: boolean;
        trustedProxyHops: number;
      };
    };
    expect(body.details.previewRateLimit.max).toBe(7);
    expect(body.details.readRateLimit.max).toBe(77);
    expect(body.details.rateLimitsAreProductDefaults).toBe(true);
    expect(body.details.trustedProxyHops).toBe(2);
  });

  it("still never claims execution", async () => {
    const { capabilities } = await load();
    const body = (await (await capabilities(req())).json()) as Record<string, unknown>;
    for (const flag of [
      "transactionSimulation",
      "mainnetExecution",
      "agenticWallet",
      "shareIntent",
      "fundedGifting",
    ]) {
      expect(body[flag], flag).toBe(false);
    }
  });

  it("carries no secret", async () => {
    const { capabilities } = await load();
    const text = JSON.stringify(await (await capabilities(req())).json());
    expect(text).not.toContain("placeholder");
    expect(text).not.toContain("orchard_app");
  });
});

describe("per-IP rate limits on the read endpoints", () => {
  it("refuses over-budget requests with 429 and a Retry-After header", async () => {
    const { health } = await load({ WEB_READ_RATE_LIMIT_MAX: "2" });
    expect((await health(req())).status).toBe(200);
    expect((await health(req())).status).toBe(200);
    const refused = await health(req());
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    const body = (await refused.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toMatch(/Try again in \d+s/);
  });

  it("buckets per client, so one visitor cannot lock out another", async () => {
    const { health } = await load({ WEB_READ_RATE_LIMIT_MAX: "1" });
    await health(req({ "x-forwarded-for": "198.51.100.1" }));
    expect((await health(req({ "x-forwarded-for": "198.51.100.1" }))).status).toBe(429);
    expect((await health(req({ "x-forwarded-for": "198.51.100.2" }))).status).toBe(200);
  });

  it("cannot be escaped by PREPENDING entries to x-forwarded-for", async () => {
    // The spoof this guards against: extra leading entries must not mint a
    // fresh bucket.
    const { health } = await load({ WEB_READ_RATE_LIMIT_MAX: "1" });
    await health(req({ "x-forwarded-for": "198.51.100.9" }));
    expect((await health(req({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" }))).status).toBe(429);
    expect(
      (await health(req({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 198.51.100.9" }))).status,
    ).toBe(429);
  });

  it("shares ONE bucket for requests with no usable client address", async () => {
    const { health } = await load({ WEB_READ_RATE_LIMIT_MAX: "1" });
    await health(req({ "x-forwarded-for": "garbage" }));
    expect((await health(req({ "x-forwarded-for": "other-garbage" }))).status).toBe(429);
  });

  it("does NOT spend the provider budget on a refused request", async () => {
    const { health } = await load({ WEB_READ_RATE_LIMIT_MAX: "1" });
    await health(req());
    providerRequest.mockClear();
    expect((await health(req())).status).toBe(429);
    expect(providerRequest).not.toHaveBeenCalled();
  });

  it("keeps the read budget SEPARATE from the preview budget", async () => {
    // Polling health must not consume a visitor's ability to get a preview.
    const { health, capabilities } = await load({
      WEB_READ_RATE_LIMIT_MAX: "2",
      WEB_RATE_LIMIT_MAX: "1",
    });
    await health(req());
    await capabilities(req());
    const third = await health(req());
    expect(third.status).toBe(429);
    // The preview limiter is a different instance; its budget is untouched.
    const api = await import("@/server/api");
    expect(api.previewRateLimiter().check("198.51.100.9").allowed).toBe(true);
  });
});
