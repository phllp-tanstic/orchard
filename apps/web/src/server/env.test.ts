import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetServerEnvForTests, serverEnv, serverEnvSchema } from "./env";

/**
 * The environment gate (F003 T1). Two properties matter: it fails CLOSED, and
 * its failure message never echoes a value - an error page or a log line must
 * not be where a provider secret leaks.
 */

const REQUIRED: Record<string, string> = {
  BINANCE_WEB3_API_KEY: "(test placeholder, not a key)",
  BINANCE_WEB3_API_SECRET: "(test placeholder, not a secret)",
  BINANCE_WEB3_BASE_URL: "https://web3.binance.com/test",
  TARGET_BINANCE_CHAIN_ID: "56",
  ORCHARD_APP_DATABASE_URL: "postgres://orchard_app:x@127.0.0.1:5432/orchard_test",
  EVIDENCE_REDACTION_SALT: "(test placeholder, not a salt)",
};

// NODE_ENV is required on ProcessEnv by Next's types, and it has a schema
// default, so it is NOT part of the required-names list above.
const BASE_ENV: NodeJS.ProcessEnv = { ...REQUIRED, NODE_ENV: "test" };

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  // A FRESH object, not a copy of the real one: a leftover WEB_* override from
  // the developer's shell would otherwise decide what these tests prove.
  process.env = { ...BASE_ENV };
  resetServerEnvForTests();
});

afterEach(() => {
  process.env = saved;
  resetServerEnvForTests();
});

describe("serverEnv", () => {
  it("accepts a complete environment and applies the product defaults", () => {
    const env = serverEnv();
    expect(env.WEB_MIN_AMOUNT_USDT).toBe("5");
    expect(env.WEB_MAX_AMOUNT_USDT).toBe("1000");
    expect(env.WEB_SNAPSHOT_MAX_AGE_SECONDS).toBe(21600);
    expect(env.WEB_RATE_LIMIT_MAX).toBe(10);
    expect(env.WEB_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(env.WEB_MAX_CONCURRENT_PREVIEWS).toBe(2);
    expect(env.PROBE_WALLET_ADDRESS).toBe("0x000000000000000000000000000000000000dEaD");
  });

  it("caches, so the schema is parsed once per process", () => {
    expect(serverEnv()).toBe(serverEnv());
  });

  it.each(Object.keys(REQUIRED))("fails closed when %s is missing", (name) => {
    delete process.env[name];
    expect(() => serverEnv()).toThrow(new RegExp(name));
  });

  it("NAMES the offending variables but never echoes a value", () => {
    process.env["BINANCE_WEB3_API_KEY"] = "";
    process.env["BINANCE_WEB3_BASE_URL"] = "definitely-not-a-url";
    try {
      serverEnv();
      throw new Error("expected serverEnv to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("BINANCE_WEB3_API_KEY");
      expect(message).toContain("BINANCE_WEB3_BASE_URL");
      expect(message).toContain("deliberately not shown");
      expect(message).not.toContain("definitely-not-a-url");
    }
  });

  it("does not echo a SECRET value even when that value is what is wrong", () => {
    // A secret that fails validation is still a secret. This is the case where
    // a careless error message would print it.
    process.env["EVIDENCE_REDACTION_SALT"] = "";
    process.env["TARGET_BINANCE_CHAIN_ID"] = "sk-live-abc123-not-a-chain-id";
    try {
      serverEnv();
      throw new Error("expected serverEnv to throw");
    } catch (err) {
      expect((err as Error).message).not.toContain("sk-live-abc123");
    }
  });

  it("rejects a database URL that is not postgres", () => {
    process.env["ORCHARD_APP_DATABASE_URL"] = "mysql://user:pw@127.0.0.1:3306/orchard";
    expect(() => serverEnv()).toThrow(/ORCHARD_APP_DATABASE_URL/);
  });

  it("rejects a probe wallet that is not a 20-byte address", () => {
    // A typo here would silently quote for somebody else's wallet.
    process.env["PROBE_WALLET_ADDRESS"] = "0xdead";
    expect(() => serverEnv()).toThrow(/PROBE_WALLET_ADDRESS/);
  });

  it("rejects a max amount that is not above the min", () => {
    process.env["WEB_MIN_AMOUNT_USDT"] = "100";
    process.env["WEB_MAX_AMOUNT_USDT"] = "100";
    expect(() => serverEnv()).toThrow(/WEB_MAX_AMOUNT_USDT must be greater/);
  });

  it.each([
    ["a negative rate limit", "WEB_RATE_LIMIT_MAX", "-1"],
    ["a zero concurrency budget", "WEB_MAX_CONCURRENT_PREVIEWS", "0"],
    ["a fractional window", "WEB_RATE_LIMIT_WINDOW_SECONDS", "1.5"],
    ["a signed amount", "WEB_MIN_AMOUNT_USDT", "-5"],
    ["an exponent amount", "WEB_MAX_AMOUNT_USDT", "1e3"],
  ])("rejects %s", (_label, name, value) => {
    process.env[name] = value;
    expect(() => serverEnv()).toThrow(new RegExp(name));
  });

  it("exposes no variable whose name suggests it reaches the browser", () => {
    // Anything NEXT_PUBLIC_* is inlined into the client bundle by Next. The
    // server schema must not be the place such a value is introduced.
    const keys = Object.keys(serverEnvSchema.shape);
    expect(keys.filter((k) => k.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });
});
