import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALGORITHM_VERSION } from "@orchard/execution";
import { apiError, apiOk, capabilities } from "./api";
import { resetServerEnvForTests } from "./env";
import { previewPolicy } from "./preview";

/**
 * The capability report has one job: never overstate what Orchard can do
 * (AGENTS.md). These tests pin the flags that must be hard false and the
 * flags that must come from an observation rather than an assumption.
 */

const REQUIRED: NodeJS.ProcessEnv = {
  BINANCE_WEB3_API_KEY: "(test placeholder, not a key)",
  BINANCE_WEB3_API_SECRET: "(test placeholder, not a secret)",
  BINANCE_WEB3_BASE_URL: "https://web3.binance.com/test",
  TARGET_BINANCE_CHAIN_ID: "56",
  ORCHARD_APP_DATABASE_URL: "postgres://orchard_app:x@127.0.0.1:5432/orchard_test",
  EVIDENCE_REDACTION_SALT: "(test placeholder, not a salt)",
  NODE_ENV: "test",
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  process.env = { ...REQUIRED };
  resetServerEnvForTests();
});

afterEach(() => {
  process.env = saved;
  resetServerEnvForTests();
});

const NONE = { rwaDiscovery: false, liveQuotes: false, bestExecution: false };
const ALL = { rwaDiscovery: true, liveQuotes: true, bestExecution: true };

describe("capabilities", () => {
  it("reports the OBSERVED flags, in both directions", () => {
    expect(capabilities(NONE)).toMatchObject(NONE);
    expect(capabilities(ALL)).toMatchObject(ALL);
  });

  it("holds the not-yet-true capabilities at hard false", () => {
    // These are not "coming soon" - they are simply not true, in either
    // direction, regardless of what the request observed.
    for (const observed of [NONE, ALL]) {
      const caps = capabilities(observed);
      expect(caps.transactionSimulation).toBe(false);
      expect(caps.mainnetExecution).toBe(false);
      expect(caps.agenticWallet).toBe(false);
      expect(caps.shareIntent).toBe(false);
      expect(caps.fundedGifting).toBe(false);
    }
  });

  it("says plainly that execution is not live and that nothing is submitted", () => {
    const reason = capabilities(ALL).details.executionNotLiveReason;
    expect(reason).toMatch(/not live/i);
    expect(reason).toMatch(/signs, submits or broadcasts/);
  });

  it("declares the single-instance assumption rather than leaving it tacit", () => {
    // The limiter and the budget are in-process. Running two instances would
    // silently double the provider load, so the assumption has to be visible.
    expect(capabilities(ALL).details.singleServerInstanceAssumed).toBe(true);
  });

  it("labels the amount bounds as product defaults, not measured limits", () => {
    const details = capabilities(ALL).details;
    expect(details.amountBoundsAreProductDefaults).toBe(true);
    expect(details.minAmount).toBe("5");
    expect(details.maxAmount).toBe("1000");
  });

  it("reports the engine's ACTUAL policy, not a restated copy of it", () => {
    // If a default changes in the engine, this report must change with it.
    const details = capabilities(ALL).details;
    const policy = previewPolicy();
    expect(details.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(details.maxQuoteAgeSeconds).toBe(policy.maxQuoteAgeSeconds);
    expect(details.maxPriceImpactBps).toBe(policy.maxPriceImpactBps);
    expect(details.maxReferenceDeviationBps).toBe(policy.maxReferenceDeviationBps);
    expect(details.allowedAssetTypes).toEqual(policy.allowedAssetTypes);
    expect(details.spendAssetSymbol).toBe(policy.spendAsset.symbol);
  });

  it("carries no secret, under any key", () => {
    const json = JSON.stringify(capabilities(ALL));
    expect(json).not.toContain("(test placeholder, not a key)");
    expect(json).not.toContain("(test placeholder, not a secret)");
    expect(json).not.toContain("(test placeholder, not a salt)");
    expect(json).not.toContain("orchard_app");
    expect(json).not.toMatch(/apiKey|apiSecret|DATABASE_URL/i);
  });
});

describe("apiOk / apiError", () => {
  it("marks every success uncacheable", async () => {
    const response = apiOk({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("keeps caller headers without losing no-store", () => {
    const response = apiOk({ ok: true }, { "X-RateLimit-Remaining": "7" });
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps each error code to its status and keeps the envelope shape", async () => {
    for (const [code, status] of [
      ["INVALID_INPUT", 400],
      ["NOT_FOUND", 404],
      ["RATE_LIMITED", 429],
      ["BUSY", 503],
      ["PROVIDER_UNAVAILABLE", 502],
      ["SNAPSHOT_UNAVAILABLE", 503],
      ["INTERNAL", 500],
    ] as const) {
      const response = apiError(code, "a message");
      expect(response.status, code).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: { code, message: "a message" } });
    }
  });

  it("omits `fields` entirely when there are none", async () => {
    const body = (await apiError("INTERNAL", "x").json()) as { error: Record<string, unknown> };
    expect("fields" in body.error).toBe(false);
  });

  it("carries field-level messages when given", async () => {
    const body = (await apiError("INVALID_INPUT", "x", { amount: "too small" }).json()) as {
      error: { fields: Record<string, string> };
    };
    expect(body.error.fields).toEqual({ amount: "too small" });
  });
});
