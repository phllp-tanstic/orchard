import { describe, expect, it, vi } from "vitest";
import { BinanceWeb3Client } from "./client.js";
import {
  BinanceApiError,
  BinanceNonJsonResponseError,
  BinanceRateLimitError,
  DOCUMENTED_CODES,
} from "./errors.js";
import type { ProviderCallRecord } from "./types.js";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("BinanceWeb3Client error mapping", () => {
  for (const code of DOCUMENTED_CODES) {
    it(`maps documented code ${code} to a BinanceApiError with that code`, async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code, message: `error ${code}` }));
      const client = new BinanceWeb3Client({
        apiKey: "SYNTHETIC_KEY",
        apiSecret: "SYNTHETIC_SECRET",
        baseUrl: "https://example.invalid",
        fetchImpl,
        maxRetries: 1,
      });

      await expect(
        client.request({ method: "GET", path: "/api/v1/dex/market/rwa/platforms" }),
      ).rejects.toMatchObject({ code });
    });
  }

  it("preserves an unknown/undocumented code verbatim rather than collapsing it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: "99999", message: "unknown" }));
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      maxRetries: 1,
    });

    try {
      await client.request({ method: "GET", path: "/api/v1/dex/market/rwa/platforms" });
      expect.unreachable("expected a BinanceApiError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BinanceApiError);
      const apiErr = err as BinanceApiError;
      expect(apiErr.code).toBe("99999");
      expect(apiErr.documented).toBe(false);
    }
  });

  it("returns data unchanged for code 0 (success)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: "0", data: { hello: "world" } }));
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
    });

    const result = await client.request<{ hello: string }>({
      method: "GET",
      path: "/api/v1/dex/market/rwa/platforms",
    });
    expect(result.data).toEqual({ hello: "world" });
    expect(result.attempts).toBe(1);
  });
});

describe("BinanceWeb3Client retry behavior", () => {
  it("retries a retryable documented code and re-signs with a fresh timestamp/nonce per attempt", async () => {
    let call = 0;
    const seenTimestamps: string[] = [];
    const seenNonces: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: URL, init: RequestInit) => {
      call += 1;
      const headers = init.headers as Record<string, string>;
      seenTimestamps.push(headers["X-OC-TIMESTAMP"]!);
      seenNonces.push(headers["X-OC-NONCE"]!);
      if (call === 1) return jsonResponse({ code: "50000", message: "internal error" });
      return jsonResponse({ code: "0", data: { ok: true } });
    });

    let tick = 0;
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      maxRetries: 3,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    });

    const result = await client.request({
      method: "GET",
      path: "/api/v1/dex/market/rwa/platforms",
    });
    expect(result.attempts).toBe(2);
    expect(seenTimestamps[0]).not.toBe(seenTimestamps[1]);
    expect(new Set(seenNonces).size).toBe(2);
  });

  it("does not retry on no-retry codes 40101, 40102, 40104", async () => {
    for (const code of ["40101", "40102", "40104"] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code, message: "auth failure" }));
      const client = new BinanceWeb3Client({
        apiKey: "SYNTHETIC_KEY",
        apiSecret: "SYNTHETIC_SECRET",
        baseUrl: "https://example.invalid",
        fetchImpl,
        maxRetries: 5,
      });

      await expect(
        client.request({ method: "GET", path: "/api/v1/dex/market/rwa/platforms" }),
      ).rejects.toMatchObject({ code });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("retries other documented codes up to maxRetries", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ code: "50001", message: "unavailable" }));
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      maxRetries: 3,
    });

    await expect(
      client.request({ method: "GET", path: "/api/v1/dex/market/rwa/platforms" }),
    ).rejects.toMatchObject({
      code: "50001",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("BinanceWeb3Client 429 handling", () => {
  it("honors Retry-After and re-signs on the retried attempt", async () => {
    let call = 0;
    const seenNonces: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: URL, init: RequestInit) => {
      call += 1;
      const headers = init.headers as Record<string, string>;
      seenNonces.push(headers["X-OC-NONCE"]!);
      if (call === 1) {
        return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
      }
      return jsonResponse({ code: "0", data: { ok: true } });
    });

    const sleeps: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", (fn: () => void, ms?: number) => {
      sleeps.push(ms ?? 0);
      return originalSetTimeout(fn, 0);
    });

    try {
      const client = new BinanceWeb3Client({
        apiKey: "SYNTHETIC_KEY",
        apiSecret: "SYNTHETIC_SECRET",
        baseUrl: "https://example.invalid",
        fetchImpl,
        maxRetries: 3,
      });

      const result = await client.request({
        method: "GET",
        path: "/api/v1/dex/market/rwa/platforms",
      });
      expect(result.attempts).toBe(2);
      expect(sleeps).toContain(1_000);
      expect(new Set(seenNonces).size).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws BinanceRateLimitError once maxRetries is exhausted on repeated 429s", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "0" } }));
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      maxRetries: 2,
    });

    await expect(
      client.request({ method: "GET", path: "/api/v1/dex/market/rwa/platforms" }),
    ).rejects.toBeInstanceOf(BinanceRateLimitError);
  });
});

describe("BinanceWeb3Client non-JSON response handling", () => {
  it("throws an informative BinanceNonJsonResponseError and makes exactly one attempt on HTTP 414", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("Request-URI Too Long", {
        status: 414,
        statusText: "Request-URI Too Long",
        headers: { "content-type": "text/plain", "content-length": "21" },
      }),
    );
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      maxRetries: 3,
    });

    try {
      await client.request({ method: "GET", path: "/api/v1/dex/market/rwa/tokens" });
      expect.unreachable("expected a BinanceNonJsonResponseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BinanceNonJsonResponseError);
      const nonJsonErr = err as BinanceNonJsonResponseError;
      expect(nonJsonErr.httpStatus).toBe(414);
      expect(nonJsonErr.contentType).toBe("text/plain");
      expect(nonJsonErr.contentLength).toBe("21");
      expect(nonJsonErr.message).toContain("414");
      expect(nonJsonErr.message).toContain("content-type=text/plain");
    }
    // 414 is a 4xx other than 408/429 - never retried.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws an informative error citing the WAF header and makes exactly one attempt on HTTP 202", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { "x-amzn-waf-action": "challenge", "x-oc-trace-id": "trace-abc123" },
      }),
    );
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      maxRetries: 3,
    });

    try {
      await client.request({ method: "GET", path: "/api/v1/dex/market/rwa/tokens" });
      expect.unreachable("expected a BinanceNonJsonResponseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BinanceNonJsonResponseError);
      const nonJsonErr = err as BinanceNonJsonResponseError;
      expect(nonJsonErr.httpStatus).toBe(202);
      expect(nonJsonErr.wafAction).toBe("challenge");
      expect(nonJsonErr.traceId).toBe("trace-abc123");
      expect(nonJsonErr.message).toContain("x-amzn-waf-action=challenge");
      expect(nonJsonErr.message).toContain("x-oc-trace-id=trace-abc123");
    }
    // 202 is not retryable (not 408/429/5xx) - never retried.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still retries a non-JSON HTTP 500 up to maxRetries", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async () => new Response("<html>Internal Server Error</html>", { status: 500 }),
      );
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      maxRetries: 3,
    });

    await expect(
      client.request({ method: "GET", path: "/api/v1/dex/market/rwa/tokens" }),
    ).rejects.toBeInstanceOf(BinanceNonJsonResponseError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("records the diagnostic headers on the evidence record even when non-retryable", async () => {
    const records: ProviderCallRecord[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { "x-amzn-waf-action": "challenge", "x-oc-blocked-by": "waf-rule-42" },
      }),
    );
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      onCall: (r) => records.push(r),
    });

    await expect(
      client.request({ method: "GET", path: "/api/v1/dex/market/rwa/tokens" }),
    ).rejects.toBeInstanceOf(BinanceNonJsonResponseError);

    expect(records).toHaveLength(1);
    expect(records[0]!.httpStatus).toBe(202);
    expect(records[0]!.wafAction).toBe("challenge");
    expect(records[0]!.blockedBy).toBe("waf-rule-42");
  });
});

describe("BinanceWeb3Client evidence hook", () => {
  it("calls onCall with secret-free metadata for every HTTP attempt", async () => {
    const records: ProviderCallRecord[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { code: "0", data: { ok: true } },
          { headers: { "X-OC-RateLimit-Remaining": "199" } },
        ),
      );
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      onCall: (r) => records.push(r),
    });

    await client.request({ method: "GET", path: "/api/v1/dex/market/rwa/platforms" });
    expect(records).toHaveLength(1);
    expect(records[0]!.providerCode).toBe("0");
    expect(records[0]!.httpStatus).toBe(200);
    expect(records[0]!.rateLimitHeaders["x-oc-ratelimit-remaining"]).toBe("199");

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("SYNTHETIC_SECRET");
    expect(serialized).not.toContain("SYNTHETIC_KEY");
  });

  it("passes through raw request query/body and exact response bytes for an evidence recorder", async () => {
    const records: ProviderCallRecord[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "0", data: { ok: true } }));
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://example.invalid",
      fetchImpl,
      onCall: (r) => records.push(r),
    });

    await client.request({
      method: "GET",
      path: "/api/v1/dex/market/rwa/tokens",
      query: { binanceChainId: 56, userWalletAddress: "0xabc" },
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.requestQuery).toEqual({ binanceChainId: 56, userWalletAddress: "0xabc" });
    expect(records[0]!.rawResponseBody).toBe(JSON.stringify({ code: "0", data: { ok: true } }));
    expect(records[0]!.responseJson).toEqual({ code: "0", data: { ok: true } });
  });
});

describe("BinanceWeb3Client base URL normalisation", () => {
  // Regression: the authentication doc states the base URL as
  // `https://web3.binance.com/build`, and the client prepends its own
  // `/build`. Before this was normalised the wire path became
  // `/build/build/...`, which is not an API route: the live edge answered
  // HTTP 202 with `x-amzn-waf-action: challenge` and a zero-byte body on
  // every call.
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["https://web3.binance.com", "base URL without the prefix"],
    ["https://web3.binance.com/build", "base URL with the documented /build prefix"],
    ["https://web3.binance.com/build/", "base URL with a trailing slash after /build"],
  ];

  for (const [baseUrl, label] of cases) {
    it(`sends exactly one /build segment for a ${label}`, async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "0", data: [] }));
      const client = new BinanceWeb3Client({
        apiKey: "SYNTHETIC_KEY",
        apiSecret: "SYNTHETIC_SECRET",
        baseUrl,
        fetchImpl,
      });

      await client.request({ method: "GET", path: "/api/v1/dex/market/rwa/platforms" });

      const url = String(fetchImpl.mock.calls[0]?.[0]);
      expect(url).toBe("https://web3.binance.com/build/api/v1/dex/market/rwa/platforms");
      expect(url).not.toContain("/build/build");
    });
  }

  it("signs the same single-/build path it puts on the wire", async () => {
    const records: ProviderCallRecord[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "0", data: [] }));
    const client = new BinanceWeb3Client({
      apiKey: "SYNTHETIC_KEY",
      apiSecret: "SYNTHETIC_SECRET",
      baseUrl: "https://web3.binance.com/build",
      fetchImpl,
      onCall: (record) => records.push(record),
    });

    await client.request({
      method: "GET",
      path: "/api/v1/dex/aggregator/supported/chain",
      query: { binanceChainId: 56 },
    });

    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    // The signed requestPath is what recordCall reports as `endpoint`; it must
    // match the path actually requested, or the gateway rejects the signature.
    expect(records[0]?.endpoint).toBe(
      "/build/api/v1/dex/aggregator/supported/chain?binanceChainId=56",
    );
    expect(`${url.pathname}${url.search}`).toBe(records[0]?.endpoint);
  });
});
