import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BinanceWeb3Client } from "./client.js";
import { BinanceApiError, DOCUMENTED_CODES, NO_RETRY_CODES } from "./errors.js";

/**
 * DEC-030 regression suite: the provider sends the envelope's `code` as a JSON
 * NUMBER, while the docs present the codes as strings.
 *
 * Driven from SYNTHETIC_numeric_code_envelopes.json, which reproduces the exact
 * wire shape (msg / code / data / success / timestamp with a numeric `code`)
 * observed on probe_run 1f42f52f-a9c8-463d-8bf9-a344758f3b6c. The pre-existing
 * tests in client.test.ts all use string codes, so none of them could ever have
 * caught this: the whole point here is to exercise the real shape end to end
 * through the client, not just BinanceApiError in isolation.
 *
 * The defect being pinned: with a numeric code, `NO_RETRY_CODES.has(...)` never
 * matched, so `isRetryable()` was always true and an auth failure was retried
 * the full maxRetries times instead of failing fast.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "..", "test", "fixtures", "SYNTHETIC_numeric_code_envelopes.json");

/**
 * A type alias, not an interface: an interface gets no implicit index
 * signature, so it would not be assignable to ProviderEnvelope's
 * `[key: string]: unknown`.
 */
type Envelope = {
  msg: string;
  code: number;
  data: unknown;
  success: boolean;
  timestamp: number;
};

interface Fixture {
  success: Envelope;
  authNoRetry: Envelope[];
  transientRetryable: Envelope[];
  observedLive: (Envelope & { _seenOn: string })[];
  undocumented: Envelope;
}

function fixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(fetchImpl: typeof fetch, maxRetries = 3): BinanceWeb3Client {
  return new BinanceWeb3Client({
    apiKey: "test-key",
    apiSecret: "test-secret",
    baseUrl: "https://web3.binance.com/build",
    maxRetries,
    fetchImpl,
    now: () => new Date("2026-09-30T00:00:00.000Z"),
    nonce: () => "fixed-nonce",
  });
}

const SPEC = { method: "GET", path: "/api/v1/dex/aggregator/quote" };

describe("DEC-030: the fixture really does carry numeric codes", () => {
  it("every code in the fixture is a JSON number, not a string", () => {
    const f = fixture();
    const all = [
      f.success,
      ...f.authNoRetry,
      ...f.transientRetryable,
      ...f.observedLive,
      f.undocumented,
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const envelope of all) {
      expect(typeof envelope.code).toBe("number");
    }
  });

  it("covers every documented no-retry code", () => {
    const codes = fixture().authNoRetry.map((e) => String(e.code));
    for (const noRetry of NO_RETRY_CODES) {
      expect(codes).toContain(noRetry);
    }
  });
});

describe("DEC-030: an auth failure with a numeric code fails fast through the client", () => {
  it.each(fixture().authNoRetry.map((e) => [e.code, e.msg] as const))(
    "code %i is not retried: exactly one fetch attempt",
    async (code, msg) => {
      const envelope = fixture().authNoRetry.find((e) => e.code === code)!;
      // A fresh Response per call, so that if the client wrongly retries, this
      // test fails on the call count below - naming the actual defect - rather
      // than on a "Body has already been read" TypeError from reusing one
      // Response, which would obscure it.
      const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(envelope)));

      await expect(makeClient(fetchImpl as unknown as typeof fetch).request(SPEC)).rejects.toThrow(
        BinanceApiError,
      );

      // The regression: before the boundary fix this was maxRetries (3),
      // because NO_RETRY_CODES.has(<number>) never matched.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(msg.length).toBeGreaterThan(0);
    },
  );

  it("surfaces the numeric code as a normalized string, flagged documented", async () => {
    const envelope = fixture().authNoRetry[0]!;
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(envelope)));

    const err = await makeClient(fetchImpl as unknown as typeof fetch)
      .request(SPEC)
      .then(() => undefined)
      .catch((e: unknown) => e);

    // A real narrowing guard: expect(...).toBeInstanceOf does not narrow for
    // the type checker, and an `as` cast would hide a wrong-type regression.
    if (!(err instanceof BinanceApiError)) {
      throw new Error(`expected a BinanceApiError, got ${String(err)}`);
    }
    expect(err.code).toBe(String(envelope.code));
    expect(typeof err.code).toBe("string");
    expect(err.documented).toBe(true);
    expect(err.isRetryable()).toBe(false);
    // The raw envelope is preserved verbatim, numeric code included, so
    // evidence keeps exactly what the provider sent.
    expect(err.envelope.code).toBe(envelope.code);
    expect(typeof err.envelope.code).toBe("number");
  });
});

describe("DEC-030: a transient numeric code is still retried", () => {
  it.each(fixture().transientRetryable.map((e) => [e.code] as const))(
    "code %i exhausts maxRetries",
    async (code) => {
      const envelope = fixture().transientRetryable.find((e) => e.code === code)!;
      // A fresh Response per call: a Response body can only be read once, so
      // mockResolvedValue would make the second attempt fail with "Body has
      // already been read" instead of the provider error under test.
      const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(envelope)));

      await expect(makeClient(fetchImpl as unknown as typeof fetch).request(SPEC)).rejects.toThrow(
        BinanceApiError,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );

  it("recovers when a retried numeric failure is followed by a numeric success", async () => {
    const f = fixture();
    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      call += 1;
      return Promise.resolve(jsonResponse(call === 1 ? f.transientRetryable[0]! : f.success));
    });

    const result = await makeClient(fetchImpl as unknown as typeof fetch).request(SPEC);
    expect(result.data).toEqual({ ok: true });
    expect(result.attempts).toBe(2);
  });
});

describe("DEC-030: a numeric success code is recognized as success", () => {
  it("numeric 0 is not treated as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(fixture().success));
    const result = await makeClient(fetchImpl as unknown as typeof fetch).request(SPEC);
    expect(result.data).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("records the numeric code as a string on the evidence record", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(fixture().success));
    const records: { providerCode: string | undefined }[] = [];
    const client = new BinanceWeb3Client({
      apiKey: "test-key",
      apiSecret: "test-secret",
      baseUrl: "https://web3.binance.com/build",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onCall: (record) => records.push({ providerCode: record.providerCode }),
    });

    await client.request(SPEC);
    expect(records).toHaveLength(1);
    expect(records[0]!.providerCode).toBe("0");
  });
});

describe("DEC-030: codes actually observed live are classified correctly", () => {
  it.each(fixture().observedLive.map((e) => [e.code, e._seenOn] as const))(
    "code %i normalizes, is retryable, and its documented flag matches the auth-doc set",
    async (code) => {
      const envelope = fixture().observedLive.find((e) => e.code === code)!;
      const err = new BinanceApiError(envelope, 200);

      expect(err.code).toBe(String(code));
      // DOCUMENTED_CODES is the authentication doc's list. 40001 (bad
      // parameter) IS on it; the Trading-API-specific codes 40401/40374/40367
      // are not. Asserted against the list rather than hardcoded, so this
      // states the truth per code instead of guessing.
      expect(err.documented).toBe((DOCUMENTED_CODES as readonly string[]).includes(String(code)));
      // None of these are auth codes, so all stay retryable.
      expect(NO_RETRY_CODES.has(String(code) as never)).toBe(false);
      expect(err.isRetryable()).toBe(true);
    },
  );

  it("an undocumented numeric code is flagged undocumented rather than swallowed", () => {
    const err = new BinanceApiError(fixture().undocumented, 200);
    expect(err.code).toBe("49999");
    expect(err.documented).toBe(false);
    expect(DOCUMENTED_CODES).not.toContain("49999");
  });
});

describe("DEC-030 audit: an adjacent field mismatch, NOT fixed here", () => {
  /**
   * Found while confirming nothing else assumed the wrong type. The provider
   * names the human-readable field `msg`, but ProviderEnvelope declares
   * `message?: string`, so BinanceApiError's own message never includes the
   * provider's explanation - it reads "Binance Web3 API error 40001" and drops
   * "either slippagePercent or autoSlippage is required".
   *
   * This is a different field from DEC-030's `code` and is therefore left
   * unchanged and unfixed. The test pins the CURRENT behavior so the gap is
   * visible and a later fix has to update it deliberately rather than silently.
   */
  it("drops the provider's `msg` text from the error message (known gap, awaiting a decision)", () => {
    const envelope = fixture().observedLive.find((e) => e.code === 40001)!;
    const err = new BinanceApiError(envelope, 200);

    expect(err.message).toBe("Binance Web3 API error 40001");
    expect(err.message).not.toContain("slippagePercent");
    // The text is not lost - it is still on the preserved raw envelope.
    expect((err.envelope as unknown as { msg: string }).msg).toBe(
      "either slippagePercent or autoSlippage is required",
    );
  });
});
