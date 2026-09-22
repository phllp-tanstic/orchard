import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { summarizeBps, classifyReferencePrice } from "./analysis.js";

describe("summarizeBps", () => {
  it("returns zero-sample summary for an empty array", () => {
    expect(summarizeBps([])).toEqual({
      sampleSize: 0,
      min: undefined,
      max: undefined,
      medianAbs: undefined,
    });
  });

  it("computes min/max/medianAbs for an odd-length sample", () => {
    const values = [new Decimal(-5), new Decimal(2), new Decimal(10)];
    const summary = summarizeBps(values);
    expect(summary).toEqual({ sampleSize: 3, min: "-5", max: "10", medianAbs: "5" });
  });

  it("averages the two middle absolute values for an even-length sample", () => {
    const values = [new Decimal(1), new Decimal(-3)];
    const summary = summarizeBps(values);
    expect(summary.medianAbs).toBe("2");
  });
});

describe("classifyReferencePrice", () => {
  it("is inconclusive with no samples at all", () => {
    const empty = { sampleSize: 0, min: undefined, max: undefined, medianAbs: undefined };
    expect(classifyReferencePrice(empty, empty)).toBe("inconclusive");
  });

  it("calls it derived-from-tokenPrice when referencePrice tracks tokenPrice tightly but not impliedPricePerShare", () => {
    const nearTokenPrice = { sampleSize: 5, min: "-0.5", max: "0.5", medianAbs: "0.2" };
    const farFromImplied = { sampleSize: 5, min: "-50", max: "50", medianAbs: "40" };
    expect(classifyReferencePrice(nearTokenPrice, farFromImplied)).toBe("derived-from-tokenPrice");
  });

  it("calls it derived-from-impliedPricePerShare in the reverse case", () => {
    const farFromTokenPrice = { sampleSize: 5, min: "-50", max: "50", medianAbs: "40" };
    const nearImplied = { sampleSize: 5, min: "-0.5", max: "0.5", medianAbs: "0.2" };
    expect(classifyReferencePrice(farFromTokenPrice, nearImplied)).toBe(
      "derived-from-impliedPricePerShare",
    );
  });

  it("calls it independent when it tracks neither closely", () => {
    const far1 = { sampleSize: 5, min: "-50", max: "50", medianAbs: "40" };
    const far2 = { sampleSize: 5, min: "-60", max: "60", medianAbs: "45" };
    expect(classifyReferencePrice(far1, far2)).toBe("independent");
  });
});
