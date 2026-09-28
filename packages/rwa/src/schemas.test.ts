import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  marketStatusSchema,
  tokenSchema,
  tokensDataSchema,
  unknownArrayItemKeys,
  unknownObjectKeys,
} from "./schemas.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "..", "test", "fixtures", "DOC_EXAMPLE_tokens.json");

function loadFixture(): unknown[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as unknown[];
}

describe("tokensDataSchema (schema drift)", () => {
  it("parses a valid DOC_EXAMPLE_tokens.json fixture without error", () => {
    const parsed = tokensDataSchema.parse(loadFixture());
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.underlyingTicker).toBe("EXA");
  });

  it("fails visibly when a required field is missing", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withoutRatio = { ...first };
    delete withoutRatio["tokenToShareRatio"];
    expect(() => tokensDataSchema.parse([withoutRatio, ...rest])).toThrow(ZodError);
  });

  it("fails visibly when a field has the wrong type", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const wrongType = { ...first, assetType: "1" }; // assetType must be numeric 1|2|3
    expect(() => tokensDataSchema.parse([wrongType, ...rest])).toThrow(ZodError);
  });

  it("fails visibly, naming the field, when decimals is a number instead of a string (DEC-012: kept strict per docs' parameter table, see docs/DEVEX_CANDIDATES.md)", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const numericDecimals = { ...first, decimals: 18 };
    expect(() => tokensDataSchema.parse([numericDecimals, ...rest])).toThrow(ZodError);

    try {
      tokensDataSchema.parse([numericDecimals, ...rest]);
      expect.unreachable("expected tokensDataSchema.parse to throw for numeric decimals");
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      const zodErr = err as ZodError;
      const decimalsIssue = zodErr.issues.find((issue) => issue.path.includes("decimals"));
      expect(decimalsIssue).toBeDefined();
      expect(decimalsIssue?.path).toContain("decimals");
    }
  });

  it("keeps and reports unknown extra fields rather than silently dropping them", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withExtra = { ...first, tokenIssuerNote: "new field the docs added later" };
    const parsed = tokensDataSchema.parse([withExtra, ...rest]);

    // passthrough keeps it in the parsed value:
    expect((parsed[0] as Record<string, unknown>)["tokenIssuerNote"]).toBe(
      "new field the docs added later",
    );
    // and it's explicitly surfaced, not just silently present:
    const unknown = unknownArrayItemKeys(tokenSchema.shape, [
      withExtra,
      ...(rest as Record<string, unknown>[]),
    ]);
    expect(unknown).toEqual(["tokenIssuerNote"]);
  });

  it("unknownObjectKeys reports nothing for a fully-known object", () => {
    const [first] = loadFixture() as Record<string, unknown>[];
    expect(unknownObjectKeys(tokenSchema.shape, first!)).toEqual([]);
  });
});

describe("marketStatusSchema", () => {
  it('parses "offhours" (DEC-019: confirmed live - see docs/DEVEX_LOG.md)', () => {
    expect(marketStatusSchema.parse("offhours")).toBe("offhours");
  });

  it('accepts a token whose statusInfo.marketStatus is "offhours"', () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withOffhours = {
      ...first,
      statusInfo: {
        ...(first!["statusInfo"] as Record<string, unknown>),
        marketStatus: "offhours",
      },
    };
    const parsed = tokensDataSchema.parse([withOffhours, ...rest]);
    expect(parsed[0]!.statusInfo.marketStatus).toBe("offhours");
  });

  it("parses null (DEC-020: confirmed live - see docs/DEVEX_LOG.md)", () => {
    expect(marketStatusSchema.nullable().parse(null)).toBeNull();
  });

  it("accepts a token whose statusInfo.marketStatus is null", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withNullStatus = {
      ...first,
      statusInfo: {
        ...(first!["statusInfo"] as Record<string, unknown>),
        marketStatus: null,
      },
    };
    const parsed = tokensDataSchema.parse([withNullStatus, ...rest]);
    expect(parsed[0]!.statusInfo.marketStatus).toBeNull();
  });

  it('parses "paused" (DEC-021: confirmed live - see docs/DEVEX_LOG.md)', () => {
    expect(marketStatusSchema.parse("paused")).toBe("paused");
  });

  it('accepts a token whose statusInfo.marketStatus is "paused"', () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withPaused = {
      ...first,
      statusInfo: {
        ...(first!["statusInfo"] as Record<string, unknown>),
        marketStatus: "paused",
      },
    };
    const parsed = tokensDataSchema.parse([withPaused, ...rest]);
    expect(parsed[0]!.statusInfo.marketStatus).toBe("paused");
  });

  it('still parses "pause" (documented value, never observed live - kept, not removed)', () => {
    expect(marketStatusSchema.parse("pause")).toBe("pause");
  });
});

describe("tokenSchema marketCap (DEC-021: null confirmed live)", () => {
  it("accepts a token with null marketCap", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withNullMarketCap = { ...first, marketCap: null };
    const parsed = tokensDataSchema.parse([withNullMarketCap, ...rest]);
    expect(parsed[0]!.marketCap).toBeNull();
  });
});

describe("tokenSchema (DEC-020: null assetType / underlyingName)", () => {
  it("accepts a token with null assetType", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withNullAssetType = { ...first, assetType: null };
    const parsed = tokensDataSchema.parse([withNullAssetType, ...rest]);
    expect(parsed[0]!.assetType).toBeNull();
  });

  it("accepts a token with null underlyingName", () => {
    const [first, ...rest] = loadFixture() as Record<string, unknown>[];
    const withNullUnderlyingName = { ...first, underlyingName: null };
    const parsed = tokensDataSchema.parse([withNullUnderlyingName, ...rest]);
    expect(parsed[0]!.underlyingName).toBeNull();
  });
});
