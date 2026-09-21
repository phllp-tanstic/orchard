import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { tokenSchema, tokensDataSchema, unknownArrayItemKeys, unknownObjectKeys } from "./schemas.js";

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
