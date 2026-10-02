import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewDto } from "@/server/dto";

/**
 * POST /api/previews, with the ENGINE MOCKED AT ITS BOUNDARY (F003 T5).
 *
 * `runPreview` is the single seam between the route and everything live: the
 * provider, the F002 engine and the evidence store. Mocking exactly there
 * tests what this route is responsible for - validation, the guard order, the
 * typed error envelope and the honest messages - without a network call or a
 * database, and without stubbing any money arithmetic.
 *
 * This is test-only. The route itself has no mock, no fixture and no fallback
 * path; a failure of the real engine surfaces as an error, never as a number.
 */

vi.mock("@/server/db", () => ({
  db: () => ({ fake: "pool" }),
  closeDbForTests: async () => {},
}));

vi.mock("@/server/preview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/preview")>();
  return { ...actual, runPreview: vi.fn() };
});

const BASE_ENV = {
  BINANCE_WEB3_API_KEY: "(test placeholder, not a key)",
  BINANCE_WEB3_API_SECRET: "(test placeholder, not a secret)",
  BINANCE_WEB3_BASE_URL: "https://web3.binance.com/test",
  TARGET_BINANCE_CHAIN_ID: "56",
  ORCHARD_APP_DATABASE_URL: "postgres://orchard_app:x@127.0.0.1:5432/orchard_test",
  EVIDENCE_REDACTION_SALT: "(test placeholder, not a salt)",
  WEB_MIN_AMOUNT_USDT: "5",
  WEB_MAX_AMOUNT_USDT: "1000",
  WEB_RATE_LIMIT_MAX: "1000",
  WEB_RATE_LIMIT_WINDOW_SECONDS: "60",
  WEB_MAX_CONCURRENT_PREVIEWS: "2",
  NODE_ENV: "test",
} as const;

const DTO: PreviewDto = {
  ticker: "NVDA",
  companyName: "Nvidia Corp",
  assetTypeLabel: "Stock",
  amount: "100",
  spendAssetSymbol: "USDT",
  outcome: "SELECTED",
  decisionReasons: ["It returned the most shares for your amount."],
  decisionReasonCodes: ["NORMALIZED_SHARES_DESC"],
  algorithmVersion: "f002-rank-1.0.0",
  maxQuoteAgeSeconds: 20,
  candidates: [],
};

let savedEnv: NodeJS.ProcessEnv;

/**
 * Loads the route with a FRESH module graph, so the module-level rate limiter,
 * concurrency budget and single-flight map start empty and the env cache is
 * re-read. Without this, one test's exhausted limiter would decide the next.
 */
async function loadRoute(overrides: Record<string, string> = {}): Promise<{
  POST: (req: NextRequest) => Promise<Response>;
  runPreview: ReturnType<typeof vi.fn>;
  errors: typeof import("@/server/preview");
}> {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) process.env[k] = v;
  const preview = await import("@/server/preview");
  const route = await import("./route");
  const runPreview = vi.mocked(preview.runPreview) as unknown as ReturnType<typeof vi.fn>;
  runPreview.mockReset();
  runPreview.mockResolvedValue(DTO);
  return { POST: route.POST, runPreview, errors: preview };
}

/**
 * Waits until the route has actually reached the engine seam. A fixed number
 * of microtask turns is not enough - the route awaits `request.json()` first -
 * and guessing one would make these tests pass or fail for timing reasons
 * rather than for the behaviour they describe.
 */
async function untilCalled(spy: ReturnType<typeof vi.fn>, times = 1): Promise<void> {
  for (let i = 0; i < 1000 && spy.mock.calls.length < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (spy.mock.calls.length < times) {
    throw new Error(`engine was called ${spy.mock.calls.length} times, expected ${times}`);
  }
}

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/previews", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  savedEnv = { ...process.env };
});

afterEach(() => {
  process.env = savedEnv;
  vi.restoreAllMocks();
});

describe("POST /api/previews - the happy path", () => {
  it("returns the DTO and marks it uncacheable", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post({ ticker: "NVDA", amount: "100" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(DTO);
  });

  it("passes the UPPERCASED ticker and the amount as an unmodified string", async () => {
    // The amount must reach the engine byte-for-byte. A route that parsed it
    // into a number would lose precision before any money code ran.
    const { POST, runPreview } = await loadRoute();
    await POST(post({ ticker: " nvda ", amount: "100.50" }));
    expect(runPreview).toHaveBeenCalledTimes(1);
    expect(runPreview.mock.calls[0]?.[0]).toMatchObject({
      ticker: "NVDA",
      amount: "100.50",
    });
  });

  it("reports the remaining per-IP budget", async () => {
    const { POST } = await loadRoute({ WEB_RATE_LIMIT_MAX: "10" });
    const response = await POST(post({ ticker: "NVDA", amount: "100" }));
    expect(response.headers.get("x-ratelimit-remaining")).toBe("9");
  });

  it("never asks the engine for anything the body did not contain", async () => {
    const { POST, runPreview } = await loadRoute();
    await POST(
      post({ ticker: "NVDA", amount: "100", userWalletAddress: "0xabc", slippagePercent: "99" }),
    );
    const args = runPreview.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args["userWalletAddress"]).toBeUndefined();
    expect(args["slippagePercent"]).toBeUndefined();
  });
});

describe("POST /api/previews - validation", () => {
  it("rejects a body that is not JSON", async () => {
    const { POST, runPreview } = await loadRoute();
    const response = await POST(post("not json at all"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INPUT");
    expect(runPreview).not.toHaveBeenCalled();
  });

  it("names the offending FIELD so the form can show it inline", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post({ ticker: "NV DA", amount: "100" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.fields.ticker).toContain("letters");
  });

  it("rejects an amount below the minimum and says what the minimum is", async () => {
    const { POST, runPreview } = await loadRoute();
    const response = await POST(post({ ticker: "NVDA", amount: "1" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("5");
    expect(runPreview).not.toHaveBeenCalled();
  });

  it("rejects an amount above the maximum", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post({ ticker: "NVDA", amount: "100000" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("1000");
  });

  it("rejects a NUMERIC amount rather than coercing it", async () => {
    const { POST, runPreview } = await loadRoute();
    expect((await POST(post({ ticker: "NVDA", amount: 100 }))).status).toBe(400);
    expect(runPreview).not.toHaveBeenCalled();
  });

  it("validates BEFORE spending any rate-limit budget on a malformed request", async () => {
    const { POST } = await loadRoute({ WEB_RATE_LIMIT_MAX: "1" });
    expect((await POST(post({ ticker: "NV DA", amount: "100" }))).status).toBe(400);
    // The one allowed request is still available for a valid call.
    expect((await POST(post({ ticker: "NVDA", amount: "100" }))).status).toBe(200);
  });
});

describe("POST /api/previews - guards", () => {
  it("returns 429 with a retry hint once the per-IP limit is spent", async () => {
    const { POST } = await loadRoute({ WEB_RATE_LIMIT_MAX: "1" });
    expect((await POST(post({ ticker: "NVDA", amount: "100" }))).status).toBe(200);
    const refused = await POST(post({ ticker: "NVDA", amount: "200" }));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toMatch(/Try again in \d+s/);
  });

  it("limits per IP, so one visitor cannot lock out another", async () => {
    const { POST } = await loadRoute({ WEB_RATE_LIMIT_MAX: "1" });
    await POST(post({ ticker: "NVDA", amount: "100" }, { "x-forwarded-for": "198.51.100.1" }));
    const other = await POST(
      post({ ticker: "NVDA", amount: "100" }, { "x-forwarded-for": "198.51.100.2" }),
    );
    expect(other.status).toBe(200);
  });

  it("coalesces identical CONCURRENT requests into one engine run", async () => {
    const { POST, runPreview } = await loadRoute();
    let release: (v: PreviewDto) => void = () => {};
    runPreview.mockImplementation(
      () =>
        new Promise<PreviewDto>((resolve) => {
          release = resolve;
        }),
    );
    const a = POST(post({ ticker: "NVDA", amount: "100" }));
    const b = POST(post({ ticker: "nvda", amount: "100" }));
    await untilCalled(runPreview);
    release(DTO);
    const [ra, rb] = await Promise.all([a, b]);
    expect(runPreview).toHaveBeenCalledTimes(1);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
  });

  it("does NOT coalesce different amounts", async () => {
    const { POST, runPreview } = await loadRoute();
    await Promise.all([
      POST(post({ ticker: "NVDA", amount: "100" })),
      POST(post({ ticker: "NVDA", amount: "200" })),
    ]);
    expect(runPreview).toHaveBeenCalledTimes(2);
  });

  it("answers BUSY rather than queueing when the budget is full", async () => {
    // A queued request would wait until its quote expired and then serve
    // something stale. The message has to say nothing was submitted.
    const { POST, runPreview } = await loadRoute({ WEB_MAX_CONCURRENT_PREVIEWS: "1" });
    let release: (v: PreviewDto) => void = () => {};
    runPreview.mockImplementation(
      () =>
        new Promise<PreviewDto>((resolve) => {
          release = resolve;
        }),
    );
    const held = POST(post({ ticker: "NVDA", amount: "100" }));
    await untilCalled(runPreview);
    const busy = await POST(post({ ticker: "AAPL", amount: "100" }));
    expect(busy.status).toBe(503);
    const body = await busy.json();
    expect(body.error.code).toBe("BUSY");
    expect(body.error.message).toMatch(/[Nn]othing was submitted/);

    release(DTO);
    await held;
  });
});

describe("POST /api/previews - failure is reported honestly", () => {
  it("404s an unsupported ticker without pretending there is a route", async () => {
    const { POST, runPreview, errors } = await loadRoute();
    runPreview.mockRejectedValue(new errors.UnknownTickerError("ZZZZ"));
    const response = await POST(post({ ticker: "ZZZZ", amount: "100" }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("ZZZZ");
  });

  it("502s a provider outage and says no transaction was submitted", async () => {
    const { POST, runPreview, errors } = await loadRoute();
    runPreview.mockRejectedValue(new errors.ProviderUnavailableError("upstream timeout"));
    const response = await POST(post({ ticker: "NVDA", amount: "100" }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(body.error.message).toMatch(/[Nn]o transaction was submitted/);
  });

  it("500s an unexpected failure WITHOUT leaking its internals", async () => {
    const { POST, runPreview } = await loadRoute();
    runPreview.mockRejectedValue(
      new Error("connect ECONNREFUSED postgres://orchard_app:hunter2@10.0.0.1:5432/orchard"),
    );
    const response = await POST(post({ ticker: "NVDA", amount: "100" }));
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("10.0.0.1");
    expect(text).toMatch(/Nothing was submitted/);
  });

  it("marks every error response uncacheable too", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post({ ticker: "NV DA", amount: "100" }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("frees the single-flight entry after a failure", async () => {
    const { POST, runPreview } = await loadRoute();
    runPreview.mockRejectedValueOnce(new Error("transient"));
    expect((await POST(post({ ticker: "NVDA", amount: "100" }))).status).toBe(500);
    runPreview.mockResolvedValue(DTO);
    expect((await POST(post({ ticker: "NVDA", amount: "100" }))).status).toBe(200);
  });
});
