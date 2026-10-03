import { describe, expect, it } from "vitest";
import {
  API_ERROR_CODES,
  HTTP_STATUS_FOR_ERROR,
  checkAmount,
  previewBodySchema,
  searchQuerySchema,
  tickerSchema,
} from "./validation";

const BOUNDS = { min: "5", max: "1000" };

describe("tickerSchema", () => {
  it("accepts and upper-cases a provider-shaped ticker", () => {
    expect(tickerSchema.parse(" nvda ")).toBe("NVDA");
    expect(tickerSchema.parse("BRK.B")).toBe("BRK.B");
    expect(tickerSchema.parse("spy-x")).toBe("SPY-X");
  });

  it.each([
    ["empty", ""],
    ["a space inside", "NV DA"],
    ["an underscore", "NV_DA"],
    ["a wildcard", "NV%"],
    ["a quote", "NVDA'"],
    ["a SQL fragment", "NVDA; DROP TABLE"],
    ["a path traversal", "../etc"],
    ["an angle bracket", "<script>"],
    ["longer than 16", "ABCDEFGHIJKLMNOPQ"],
  ])("rejects %s", (_label, input) => {
    expect(tickerSchema.safeParse(input).success).toBe(false);
  });

  it("explains the rule in plain language rather than echoing a regex", () => {
    const result = tickerSchema.safeParse("NV DA");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toContain("letters");
      expect(message).not.toContain("^[A-Za-z");
    }
  });
});

describe("searchQuerySchema", () => {
  it("defaults the limit rather than returning an unbounded page", () => {
    expect(searchQuerySchema.parse({ q: "nv" })).toEqual({ q: "nv", limit: 20 });
  });

  it("caps the limit", () => {
    expect(searchQuerySchema.safeParse({ q: "nv", limit: 500 }).success).toBe(false);
    expect(searchQuerySchema.parse({ q: "nv", limit: "50" }).limit).toBe(50);
  });

  it("rejects an empty or whitespace-only query", () => {
    expect(searchQuerySchema.safeParse({ q: "" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
  });

  it("accepts free text, because a company NAME is searchable", () => {
    // Unlike a ticker, a name legitimately contains spaces and punctuation.
    expect(searchQuerySchema.parse({ q: "Berkshire Hathaway" }).q).toBe("Berkshire Hathaway");
  });

  it("bounds the length so a huge query cannot reach the database", () => {
    expect(searchQuerySchema.safeParse({ q: "a".repeat(65) }).success).toBe(false);
  });
});

describe("checkAmount", () => {
  it("accepts amounts inside the bounds", () => {
    expect(checkAmount("100", BOUNDS).ok).toBe(true);
    expect(checkAmount(" 100.50 ", BOUNDS).ok).toBe(true);
  });

  it("accepts the bounds themselves (inclusive)", () => {
    expect(checkAmount("5", BOUNDS).ok).toBe(true);
    expect(checkAmount("1000", BOUNDS).ok).toBe(true);
  });

  it("reports BELOW_MIN and ABOVE_MAX with the actual bound in the message", () => {
    const low = checkAmount("4.99", BOUNDS);
    expect(low.problem).toBe("BELOW_MIN");
    expect(low.message).toContain("5");
    const high = checkAmount("1000.01", BOUNDS);
    expect(high.problem).toBe("ABOVE_MAX");
    expect(high.message).toContain("1000");
  });

  it.each([
    ["a bare minus", "-100"],
    ["an exponent", "1e3"],
    ["a thousands separator", "1,000"],
    ["a currency symbol", "$100"],
    ["a trailing dot", "100."],
    ["a leading dot", ".5"],
    ["a leading zero", "0100"],
    ["words", "one hundred"],
    ["empty", ""],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
    ["a hex literal", "0x64"],
    ["a unary plus", "+100"],
  ])("rejects %s as NOT_A_NUMBER", (_label, input) => {
    const result = checkAmount(input, BOUNDS);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("NOT_A_NUMBER");
  });

  it("rejects more decimal places than the spend asset can express", () => {
    const result = checkAmount(`5.${"1".repeat(19)}`, BOUNDS);
    expect(result.problem).toBe("TOO_PRECISE");
    expect(checkAmount("5.1", { ...BOUNDS, maxDecimals: 0 }).problem).toBe("TOO_PRECISE");
  });

  it("compares with decimal arithmetic, not floats", () => {
    // 0.1 + 0.2 style error would make a boundary amount flip. Exact decimal
    // comparison keeps "1000.0000000000000001" above the max.
    expect(checkAmount("1000.0000000000000001", BOUNDS).problem).toBe("ABOVE_MAX");
    expect(checkAmount("4.9999999999999999", BOUNDS).problem).toBe("BELOW_MIN");
  });

  it("checks the number BEFORE the precision, so a non-number says so", () => {
    expect(checkAmount("abc.123456789012345678901", BOUNDS).problem).toBe("NOT_A_NUMBER");
  });
});

describe("previewBodySchema", () => {
  it("normalises the ticker and keeps the amount as a STRING", () => {
    // The amount must never pass through a JS number: that is precision loss
    // before the money code ever sees it.
    const parsed = previewBodySchema.parse({ ticker: "nvda", amount: "100.50" });
    expect(parsed).toEqual({ ticker: "NVDA", amount: "100.50" });
  });

  it("rejects a numeric amount rather than coercing it", () => {
    expect(previewBodySchema.safeParse({ ticker: "NVDA", amount: 100 }).success).toBe(false);
  });

  it("rejects a missing field and extra junk is dropped, not trusted", () => {
    expect(previewBodySchema.safeParse({ ticker: "NVDA" }).success).toBe(false);
    const parsed = previewBodySchema.parse({
      ticker: "NVDA",
      amount: "100",
      userWalletAddress: "0xdeadbeef",
      slippagePercent: "99",
    });
    expect(parsed).toEqual({ ticker: "NVDA", amount: "100" });
    expect(Object.keys(parsed)).toEqual(["ticker", "amount"]);
  });
});

describe("API error contract", () => {
  it("maps every error code to an HTTP status", () => {
    for (const code of API_ERROR_CODES) {
      expect(HTTP_STATUS_FOR_ERROR[code], `no status for ${code}`).toBeGreaterThanOrEqual(400);
    }
  });

  it("uses retryable statuses for the transient conditions", () => {
    expect(HTTP_STATUS_FOR_ERROR.RATE_LIMITED).toBe(429);
    expect(HTTP_STATUS_FOR_ERROR.BUSY).toBe(503);
    expect(HTTP_STATUS_FOR_ERROR.SNAPSHOT_UNAVAILABLE).toBe(503);
    expect(HTTP_STATUS_FOR_ERROR.PROVIDER_UNAVAILABLE).toBe(502);
  });

  it("never reports a provider or capacity problem as the visitor's fault", () => {
    for (const code of ["BUSY", "PROVIDER_UNAVAILABLE", "SNAPSHOT_UNAVAILABLE"] as const) {
      expect(HTTP_STATUS_FOR_ERROR[code]).toBeGreaterThanOrEqual(500);
    }
  });
});
