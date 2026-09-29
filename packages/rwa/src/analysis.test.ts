import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { summarizeBps, classifyReferencePriceStability } from "./analysis.js";
import type { BpsSummary, BpsTokenRef } from "./analysis.js";

const tokenRef = (ticker: string): BpsTokenRef => ({
  tokenContractAddress: `0x${ticker.toLowerCase()}`,
  platformId: "ondo",
  underlyingTicker: ticker,
});

describe("summarizeBps", () => {
  it("returns zero-sample summary for an empty array", () => {
    expect(summarizeBps([])).toEqual({
      sampleSize: 0,
      min: undefined,
      max: undefined,
      medianAbs: undefined,
      minToken: undefined,
      maxToken: undefined,
    });
  });

  it("computes min/max/medianAbs for an odd-length sample", () => {
    const samples = [
      { value: new Decimal(-5), token: tokenRef("AAA") },
      { value: new Decimal(2), token: tokenRef("BBB") },
      { value: new Decimal(10), token: tokenRef("CCC") },
    ];
    const summary = summarizeBps(samples);
    expect(summary.sampleSize).toBe(3);
    expect(summary.min).toBe("-5");
    expect(summary.max).toBe("10");
    expect(summary.medianAbs).toBe("5");
  });

  it("averages the two middle absolute values for an even-length sample", () => {
    const samples = [
      { value: new Decimal(1), token: tokenRef("AAA") },
      { value: new Decimal(-3), token: tokenRef("BBB") },
    ];
    expect(summarizeBps(samples).medianAbs).toBe("2");
  });

  it("names the token at each end of the range, regardless of input order", () => {
    const samples = [
      { value: new Decimal(2), token: tokenRef("MID") },
      { value: new Decimal(10), token: tokenRef("HIGH") },
      { value: new Decimal(-5), token: tokenRef("LOW") },
    ];
    const summary = summarizeBps(samples);
    expect(summary.minToken).toEqual(tokenRef("LOW"));
    expect(summary.maxToken).toEqual(tokenRef("HIGH"));
  });

  it("reports the same token for both ends of a single-sample range", () => {
    const summary = summarizeBps([{ value: new Decimal(7), token: tokenRef("ONLY") }]);
    expect(summary.min).toBe("7");
    expect(summary.max).toBe("7");
    expect(summary.minToken).toEqual(tokenRef("ONLY"));
    expect(summary.maxToken).toEqual(tokenRef("ONLY"));
  });

  it("resolves a tied min to the first such sample and a tied max to the last", () => {
    const samples = [
      { value: new Decimal(4), token: tokenRef("HIGHFIRST") },
      { value: new Decimal(4), token: tokenRef("HIGHLAST") },
      { value: new Decimal(-1), token: tokenRef("LOWFIRST") },
      { value: new Decimal(-1), token: tokenRef("LOWLAST") },
    ];
    const summary = summarizeBps(samples);
    // A stable sort keeps tied values in input order, so the ends of the
    // sorted array are the first tied min and the last tied max.
    expect(summary.minToken).toEqual(tokenRef("LOWFIRST"));
    expect(summary.maxToken).toEqual(tokenRef("HIGHLAST"));
  });

  it("leaves min/max/medianAbs identical to the same values without token refs", () => {
    const values = [new Decimal("-12.5"), new Decimal("0.25"), new Decimal("3"), new Decimal("8")];
    const summary = summarizeBps(values.map((value, i) => ({ value, token: tokenRef(`T${i}`) })));
    expect({
      sampleSize: summary.sampleSize,
      min: summary.min,
      max: summary.max,
      medianAbs: summary.medianAbs,
    }).toEqual({ sampleSize: 4, min: "-12.5", max: "8", medianAbs: "5.5" });
  });
});

describe("classifyReferencePriceStability", () => {
  const summary = (over: Partial<BpsSummary> = {}): BpsSummary => ({
    sampleSize: 5,
    min: "-0.5",
    max: "0.5",
    medianAbs: "0.2",
    minToken: undefined,
    maxToken: undefined,
    ...over,
  });

  it("is inconclusive with no samples", () => {
    expect(
      classifyReferencePriceStability(
        summary({ sampleSize: 0, min: undefined, max: undefined, medianAbs: undefined }),
      ),
    ).toBe("inconclusive");
  });

  it("is inconclusive when there are samples but no median", () => {
    expect(classifyReferencePriceStability(summary({ medianAbs: undefined }))).toBe("inconclusive");
  });

  it("calls a run stable when the median absolute drift is under a basis point", () => {
    expect(classifyReferencePriceStability(summary({ medianAbs: "0.2" }))).toBe("stable");
  });

  it("treats exactly 1 bps of median drift as stable", () => {
    expect(classifyReferencePriceStability(summary({ medianAbs: "1" }))).toBe("stable");
  });

  it("calls a run unstable once the median drift passes a basis point", () => {
    expect(classifyReferencePriceStability(summary({ medianAbs: "1.0001" }))).toBe("unstable");
    expect(classifyReferencePriceStability(summary({ medianAbs: "40" }))).toBe("unstable");
  });

  it("judges on the median, not the extremes - wide tails alone do not make a run unstable", () => {
    // p99/max drift of this size was recorded live in probe_run 634f558e.
    const wideTails = summary({ min: "-73.3", max: "73.3", medianAbs: "0.0000000001" });
    expect(classifyReferencePriceStability(wideTails)).toBe("stable");
  });
});
