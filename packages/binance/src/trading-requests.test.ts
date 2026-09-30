import { describe, expect, it } from "vitest";
import {
  TRADING_PATHS,
  assertSmallestUnitAmount,
  buildApproveTransactionRequest,
  buildQuoteRequest,
  buildSupportedChainRequest,
  buildSwapRequest,
} from "./trading-requests.js";

describe("assertSmallestUnitAmount", () => {
  it("accepts unsigned base-10 integers with no leading zeros", () => {
    for (const value of ["0", "1", "10000000", "1000000000000000000"]) {
      expect(() => assertSmallestUnitAmount("amount", value)).not.toThrow();
    }
  });

  it("rejects anything that a provider could mis-scale (floats, exponents, signs, leading zeros)", () => {
    for (const value of ["", " ", "10.0", "1e18", "-1", "+1", "0x10", "010", "1_000", "1,000"]) {
      expect(() => assertSmallestUnitAmount("amount", value)).toThrow(/smallest-unit integer/);
    }
  });
});

describe("buildQuoteRequest", () => {
  it("encodes every documented parameter under its exact name", () => {
    const spec = buildQuoteRequest({
      binanceChainId: "56",
      amount: "10000000",
      fromTokenAddress: "0xfrom",
      toTokenAddress: "0xto",
      userWalletAddress: "0xprobe",
      vendor: "SomeVendor",
      feePercent: "0",
      feeSource: "fromToken",
    });

    expect(spec.method).toBe("GET");
    expect(spec.path).toBe("/api/v1/dex/aggregator/quote");
    expect(spec.path).toBe(TRADING_PATHS.quote);
    expect(spec.query).toEqual({
      binanceChainId: "56",
      amount: "10000000",
      fromTokenAddress: "0xfrom",
      toTokenAddress: "0xto",
      userWalletAddress: "0xprobe",
      vendor: "SomeVendor",
      feePercent: "0",
      feeSource: "fromToken",
    });
  });

  it("leaves optional parameters undefined so the client omits them from the signed query", () => {
    const spec = buildQuoteRequest({
      binanceChainId: "56",
      amount: "1",
      fromTokenAddress: "0xfrom",
      toTokenAddress: "0xto",
    });
    expect(spec.query?.["userWalletAddress"]).toBeUndefined();
    expect(spec.query?.["vendor"]).toBeUndefined();
  });

  it("rejects a non-smallest-unit amount before any request is made", () => {
    expect(() =>
      buildQuoteRequest({
        binanceChainId: "56",
        amount: "10.50",
        fromTokenAddress: "0xfrom",
        toTokenAddress: "0xto",
      }),
    ).toThrow(/smallest-unit integer/);
  });

  it("rejects an empty required address", () => {
    expect(() =>
      buildQuoteRequest({
        binanceChainId: "56",
        amount: "1",
        fromTokenAddress: "",
        toTokenAddress: "0xto",
      }),
    ).toThrow(/fromTokenAddress must not be empty/);
  });
});

describe("buildSwapRequest", () => {
  it("requires userWalletAddress and quoteId and passes both through verbatim", () => {
    const spec = buildSwapRequest({
      binanceChainId: "56",
      amount: "10000000",
      fromTokenAddress: "0xfrom",
      toTokenAddress: "0xto",
      userWalletAddress: "0xprobe",
      quoteId: "abc123",
      slippagePercent: "0.5",
    });
    expect(spec.path).toBe("/api/v1/dex/aggregator/swap");
    expect(spec.query?.["quoteId"]).toBe("abc123");
    expect(spec.query?.["userWalletAddress"]).toBe("0xprobe");
    expect(spec.query?.["slippagePercent"]).toBe("0.5");
  });

  it("rejects an empty quoteId", () => {
    expect(() =>
      buildSwapRequest({
        binanceChainId: "56",
        amount: "1",
        fromTokenAddress: "0xfrom",
        toTokenAddress: "0xto",
        userWalletAddress: "0xprobe",
        quoteId: "",
      }),
    ).toThrow(/quoteId must not be empty/);
  });

  it("validates approveAmount as a smallest-unit integer when supplied", () => {
    expect(() =>
      buildSwapRequest({
        binanceChainId: "56",
        amount: "1",
        fromTokenAddress: "0xfrom",
        toTokenAddress: "0xto",
        userWalletAddress: "0xprobe",
        quoteId: "abc",
        approveAmount: "1.5",
      }),
    ).toThrow(/approveAmount must be a smallest-unit integer/);
  });
});

describe("buildApproveTransactionRequest", () => {
  it("passes vendor through when supplied (the RFQ spender path)", () => {
    const spec = buildApproveTransactionRequest({
      binanceChainId: "56",
      tokenContractAddress: "0xusdt",
      approveAmount: "10000000",
      vendor: "SomeVendor",
    });
    expect(spec.path).toBe("/api/v1/dex/aggregator/approve-transaction");
    expect(spec.query).toEqual({
      binanceChainId: "56",
      tokenContractAddress: "0xusdt",
      approveAmount: "10000000",
      vendor: "SomeVendor",
    });
  });

  it("omits vendor when not supplied (the standard router path)", () => {
    const spec = buildApproveTransactionRequest({
      binanceChainId: "56",
      tokenContractAddress: "0xusdt",
      approveAmount: "10000000",
    });
    expect(spec.query?.["vendor"]).toBeUndefined();
  });
});

describe("buildSupportedChainRequest", () => {
  it("builds with no parameters at all", () => {
    const spec = buildSupportedChainRequest();
    expect(spec.method).toBe("GET");
    expect(spec.path).toBe("/api/v1/dex/aggregator/supported/chain");
    expect(spec.query?.["binanceChainId"]).toBeUndefined();
  });

  it("filters by chain when asked", () => {
    expect(buildSupportedChainRequest({ binanceChainId: "56" }).query?.["binanceChainId"]).toBe(
      "56",
    );
  });
});
