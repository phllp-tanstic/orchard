import { describe, expect, it } from "vitest";
import {
  impliedPricePerShare,
  bpsDifference,
  parseDecimal,
  ratioAnomalyReason,
} from "./normalize.js";

describe("impliedPricePerShare", () => {
  it("divides tokenPrice by tokenToShareRatio using decimal.js (no float rounding)", () => {
    const result = impliedPricePerShare("123.456789012345", "0.001");
    expect(result.toString()).toBe("123456.789012345");
  });

  it("preserves many decimal places without float precision loss", () => {
    // 1 / 3 as a float is 0.3333333333333333 (16 digits); decimal.js keeps 20 sig figs by default.
    const result = impliedPricePerShare("1", "3");
    expect(result.toString()).toBe("0.33333333333333333333");
  });

  it("handles a ratio with many decimal places", () => {
    const result = impliedPricePerShare("100", "0.000000000123456789");
    expect(result.toFixed(0)).toBe("810000007371");
  });

  it("throws rather than dividing by zero when tokenToShareRatio is 0", () => {
    expect(() => impliedPricePerShare("100", "0")).toThrow(/zero/);
  });
});

describe("bpsDifference", () => {
  it("computes basis points difference between two decimals", () => {
    const a = parseDecimal("101");
    const b = parseDecimal("100");
    expect(bpsDifference(a, b)?.toString()).toBe("100");
  });

  it("returns undefined when the denominator is zero", () => {
    expect(bpsDifference(parseDecimal("1"), parseDecimal("0"))).toBeUndefined();
  });

  it("is exact for many-decimal-place inputs, unlike float math", () => {
    const a = parseDecimal("0.1000000000000000001");
    const b = parseDecimal("0.1");
    const diff = bpsDifference(a, b);
    expect(diff?.toFixed(20)).toBe("0.00000000000001000000");
  });
});

describe("ratioAnomalyReason", () => {
  it("flags an empty tokenToShareRatio", () => {
    expect(ratioAnomalyReason("")).toMatch(/empty/);
  });

  it("flags a non-numeric tokenToShareRatio", () => {
    expect(ratioAnomalyReason("abc")).toMatch(/not a plain decimal/);
  });

  it("flags a zero tokenToShareRatio", () => {
    expect(ratioAnomalyReason("0")).toMatch(/zero/);
  });

  it("flags a zero tokenToShareRatio with a fractional part (0.0)", () => {
    expect(ratioAnomalyReason("0.0")).toMatch(/zero/);
  });

  it("flags a negative tokenToShareRatio (sign is not a plain decimal)", () => {
    expect(ratioAnomalyReason("-1")).toMatch(/not a plain decimal/);
  });

  it("does not flag a valid positive tokenToShareRatio", () => {
    expect(ratioAnomalyReason("0.001")).toBeUndefined();
  });

  it("does not flag a valid positive integer tokenToShareRatio", () => {
    expect(ratioAnomalyReason("1")).toBeUndefined();
  });

  describe("rejects anything that isn't a strict plain decimal, even though it parses as a number elsewhere", () => {
    it.each([
      ["hex", "0x10"],
      ["binary", "0b11"],
      ["octal-looking", "0o17"],
      ["scientific notation", "1e5"],
      ["digit-group separators", "1_000"],
      ["explicit plus sign", "+1"],
      ["leading zero", "01"],
      ["leading decimal point", ".5"],
      ["trailing decimal point", "1."],
      ["whitespace-padded", " 1 "],
      ["NaN literal", "NaN"],
      ["Infinity literal", "Infinity"],
      ["fraction syntax", "1/2"],
    ])("%s: %j", (_label, bad) => {
      expect(ratioAnomalyReason(bad)).toMatch(/not a plain decimal/);
    });
  });

  it("never throws for any of the invalid shapes (no crash, no invalid NUMERIC)", () => {
    for (const bad of [
      "",
      "abc",
      "0",
      "-1",
      "0x10",
      "0b11",
      "1e5",
      "1_000",
      "NaN",
      "Infinity",
      "1/2",
    ]) {
      expect(() => ratioAnomalyReason(bad)).not.toThrow();
    }
  });
});
