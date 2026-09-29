import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { unknownArrayItemKeys, unknownObjectKeys } from "@orchard/rwa";
import {
  DOCUMENTED_EXECUTION_MODES,
  SPEC_REFERENCED_RFQ_VENDORS,
  TRADING_DOCUMENTED_CODES,
  approveTransactionDataSchema,
  approveTransactionSchema,
  approveTransactionsOf,
  isDocumentedExecutionMode,
  isDocumentedVendorName,
  quoteDataSchema,
  quoteRouteSchema,
  supportedChainDataSchema,
  swapDataSchema,
} from "./trading-schemas.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "..", "test", "fixtures", "SYNTHETIC_trading_payloads.json");

interface Fixtures {
  quoteData: Record<string, unknown>[];
  swapDataRfq: Record<string, unknown>;
  swapDataTx: Record<string, unknown>;
  approveTransactionObject: Record<string, unknown>;
}

function loadFixtures(): Fixtures {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixtures;
}

describe("quoteDataSchema", () => {
  it("parses a documented-shape quote route and keeps every amount as an exact string", () => {
    const parsed = quoteDataSchema.parse(loadFixtures().quoteData);
    expect(parsed).toHaveLength(1);
    const route = parsed[0]!;
    expect(route.quoteId).toBe("00000000000000000000000000000001");
    expect(route.toTokenAmount).toBe("41234567890000000");
    expect(typeof route.toTokenAmount).toBe("string");
    expect(route.executionMode).toBe("RFQ");
    expect(route.approveTarget).toBe("0xspnd");
    expect(route.isBest).toBe(true);
    expect(route.fromToken?.decimal).toBe("18");
  });

  it("fails visibly when a required field is missing", () => {
    const [route] = loadFixtures().quoteData;
    const withoutQuoteId = { ...route };
    delete withoutQuoteId["quoteId"];
    expect(() => quoteDataSchema.parse([withoutQuoteId])).toThrow(ZodError);
  });

  it("fails visibly when an amount arrives as a number instead of a string", () => {
    const [route] = loadFixtures().quoteData;
    expect(() => quoteDataSchema.parse([{ ...route, toTokenAmount: 41234567890000000 }])).toThrow(
      ZodError,
    );
  });

  it("accepts an executionMode outside the documented set rather than rejecting it", () => {
    const [route] = loadFixtures().quoteData;
    const parsed = quoteDataSchema.parse([{ ...route, executionMode: "SOMETHING_NEW" }]);
    expect(parsed[0]!.executionMode).toBe("SOMETHING_NEW");
    expect(isDocumentedExecutionMode("SOMETHING_NEW")).toBe(false);
    expect(DOCUMENTED_EXECUTION_MODES).toContain("RFQ");
  });

  it("keeps unknown fields via passthrough and reports them", () => {
    const [route] = loadFixtures().quoteData;
    const raw = [{ ...route, someNewField: "x", anotherNewField: 1 }];
    const parsed = quoteDataSchema.parse(raw);
    expect((parsed[0] as Record<string, unknown>)["someNewField"]).toBe("x");
    expect(unknownArrayItemKeys(quoteRouteSchema.shape, raw)).toEqual([
      "anotherNewField",
      "someNewField",
    ]);
  });
});

describe("swapDataSchema", () => {
  it("parses the RFQ shape: rfq present, tx absent", () => {
    const parsed = swapDataSchema.parse(loadFixtures().swapDataRfq);
    expect(parsed.executionMode).toBe("RFQ");
    expect(parsed.tx).toBeUndefined();
    expect(parsed.rfq?.vendor).toBe("SyntheticRfqVendor");
    expect(parsed.rfq?.txType).toBe("EIP712");
    expect(typeof parsed.rfq?.typedDataToSign).toBe("string");
  });

  it("parses the SWAP shape: tx present with raw calldata, rfq absent", () => {
    const parsed = swapDataSchema.parse(loadFixtures().swapDataTx);
    expect(parsed.executionMode).toBe("SWAP");
    expect(parsed.rfq).toBeUndefined();
    expect(parsed.tx?.data).toBe("0xdeadbeef");
    expect(parsed.tx?.value).toBe("0");
    expect(parsed.tx?.from).toBe("0xwal");
  });

  it("reports unknown top-level fields on the swap payload", () => {
    const raw = { ...loadFixtures().swapDataRfq, newTopLevel: true };
    swapDataSchema.parse(raw);
    expect(unknownObjectKeys(swapDataSchema.shape, raw)).toEqual(["newTopLevel"]);
  });

  it("fails visibly when rfq is present but has no vendor", () => {
    const fixture = loadFixtures().swapDataRfq;
    const rfq = { ...(fixture["rfq"] as Record<string, unknown>) };
    delete rfq["vendor"];
    expect(() => swapDataSchema.parse({ ...fixture, rfq })).toThrow(ZodError);
  });

  it("fails visibly when tx is present but has no calldata", () => {
    const fixture = loadFixtures().swapDataTx;
    const tx = { ...(fixture["tx"] as Record<string, unknown>) };
    delete tx["data"];
    expect(() => swapDataSchema.parse({ ...fixture, tx })).toThrow(ZodError);
  });
});

describe("approveTransactionDataSchema", () => {
  it("accepts a single object and normalizes it to a one-item list", () => {
    const parsed = approveTransactionDataSchema.parse(loadFixtures().approveTransactionObject);
    const list = approveTransactionsOf(parsed);
    expect(list).toHaveLength(1);
    expect(list[0]!.dexContractAddress).toBe("0xspnd");
    expect(list[0]!.data.startsWith("0x095ea7b3")).toBe(true);
  });

  it("accepts an array of objects too (the doc page does not settle which arrives)", () => {
    const obj = loadFixtures().approveTransactionObject;
    const list = approveTransactionsOf(approveTransactionDataSchema.parse([obj, obj]));
    expect(list).toHaveLength(2);
  });

  it("fails visibly when the calldata field is missing", () => {
    const obj = { ...loadFixtures().approveTransactionObject };
    delete obj["data"];
    expect(() => approveTransactionDataSchema.parse(obj)).toThrow(ZodError);
  });

  it("reports unknown fields on the approve payload", () => {
    const raw = { ...loadFixtures().approveTransactionObject, extra: 1 };
    approveTransactionDataSchema.parse(raw);
    expect(unknownObjectKeys(approveTransactionSchema.shape, raw)).toEqual(["extra"]);
  });
});

describe("supportedChainDataSchema", () => {
  it("parses a minimal chain list", () => {
    const parsed = supportedChainDataSchema.parse([{ binanceChainId: "56", name: "BNB Chain" }]);
    expect(parsed[0]!.binanceChainId).toBe("56");
  });
});

describe("documented-value reference lists", () => {
  it("treats both the current doc page vendors and the spec-referenced RFQ vendors as known", () => {
    expect(isDocumentedVendorName("Pancake")).toBe(true);
    expect(isDocumentedVendorName("PcsXRfq")).toBe(true);
    expect(isDocumentedVendorName("TotallyNewVendor")).toBe(false);
    // The spec's three RFQ vendor names are NOT on the current doc page; they
    // are carried as reference only, never as an assumption.
    expect(SPEC_REFERENCED_RFQ_VENDORS).toEqual(["InchFusion", "CowSwap", "PcsXRfq"]);
  });

  it("records the documented quote-expiry code without asserting it happens live", () => {
    expect(TRADING_DOCUMENTED_CODES.quoteExpired).toBe("40401");
    expect(TRADING_DOCUMENTED_CODES.swapQuoteMismatch).toBe("40462");
  });
});
