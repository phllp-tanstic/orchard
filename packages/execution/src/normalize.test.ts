import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import {
  deviationBps,
  effectivePricePerShare,
  normalizeShares,
  priceImpactPercentToBps,
  quoteAgeSeconds,
  ratioRejectionDetail,
  toSmallestUnit,
} from "./normalize.js";

describe("normalizeShares", () => {
  it("scales smallest units to tokens then applies the ratio (ratio 1)", () => {
    // Live shape: ondo AALon, ratio 1, 18 decimals, 100 USDT spend.
    const shares = normalizeShares({
      toTokenAmount: "7476087371205353271",
      toTokenDecimals: "18",
      tokenToShareRatio: "1",
    });
    expect(shares.toFixed()).toBe("7.476087371205353271");
  });

  it("applies a non-1 ratio exactly, with no float error (ratio 10)", () => {
    // Live shape: ondo PPLTon, ratio 10.
    const shares = normalizeShares({
      toTokenAmount: "644939065291602942",
      toTokenDecimals: 18,
      tokenToShareRatio: "10",
    });
    expect(shares.toFixed()).toBe("6.44939065291602942");
  });

  it("keeps full precision on a many-decimal ratio", () => {
    // Live shape: ondo KLACon, ratio 10.026064925604903975.
    const shares = normalizeShares({
      toTokenAmount: "51073067401491596",
      toTokenDecimals: 18,
      tokenToShareRatio: "10.026064925604903975",
    });
    // Exact product, not a rounded one.
    const expected = new Decimal("51073067401491596")
      .dividedBy(new Decimal(10).pow(18))
      .times(new Decimal("10.026064925604903975"));
    expect(shares.equals(expected)).toBe(true);
    expect(shares.toFixed()).toContain(".");
  });

  it("handles a sub-1 ratio", () => {
    const shares = normalizeShares({
      toTokenAmount: "1000000000000000000",
      toTokenDecimals: 18,
      tokenToShareRatio: "0.066667",
    });
    expect(shares.toFixed()).toBe("0.066667");
  });

  it("handles decimals other than 18", () => {
    expect(
      normalizeShares({
        toTokenAmount: "1500000",
        toTokenDecimals: 6,
        tokenToShareRatio: "2",
      }).toFixed(),
    ).toBe("3");
    expect(
      normalizeShares({ toTokenAmount: "5", toTokenDecimals: 0, tokenToShareRatio: "1" }).toFixed(),
    ).toBe("5");
  });

  it("rejects a zero ratio", () => {
    expect(() =>
      normalizeShares({ toTokenAmount: "1", toTokenDecimals: 18, tokenToShareRatio: "0" }),
    ).toThrow(/tokenToShareRatio is zero/);
  });

  it("rejects a non-numeric or signed ratio", () => {
    for (const ratio of ["", " ", "abc", "-1", "1e3", "0x2", "1,5"]) {
      expect(() =>
        normalizeShares({ toTokenAmount: "1", toTokenDecimals: 18, tokenToShareRatio: ratio }),
      ).toThrow();
    }
  });

  it("rejects a non-smallest-unit toTokenAmount", () => {
    for (const amount of ["1.5", "-1", "1e18", "", "0x1", "01"]) {
      expect(() =>
        normalizeShares({ toTokenAmount: amount, toTokenDecimals: 18, tokenToShareRatio: "1" }),
      ).toThrow(/smallest-unit integer string/);
    }
  });

  it("rejects nonsense decimals", () => {
    for (const d of [-1, 1.5, 37]) {
      expect(() =>
        normalizeShares({ toTokenAmount: "1", toTokenDecimals: d, tokenToShareRatio: "1" }),
      ).toThrow(/toTokenDecimals/);
    }
  });
});

describe("ratioRejectionDetail", () => {
  it("accepts usable ratios", () => {
    for (const r of ["1", "10", "0.066667", "10.026064925604903975", "0.5"]) {
      expect(ratioRejectionDetail(r)).toBeUndefined();
    }
  });

  it("names why an unusable ratio is unusable", () => {
    expect(ratioRejectionDetail("")).toMatch(/empty/);
    expect(ratioRejectionDetail("0")).toMatch(/zero/);
    expect(ratioRejectionDetail("-1")).toMatch(/not a plain decimal/);
    expect(ratioRejectionDetail("1e3")).toMatch(/not a plain decimal/);
  });
});

describe("effectivePricePerShare", () => {
  it("divides spend by shares exactly", () => {
    const shares = new Decimal("7.476087371205353271");
    const price = effectivePricePerShare("100", shares);
    // Reproduces the live AALon figure.
    expect(price?.toFixed(18)).toBe("13.375980648000000296");
  });

  it("returns undefined for zero or negative shares rather than inventing a price", () => {
    expect(effectivePricePerShare("100", new Decimal(0))).toBeUndefined();
    expect(effectivePricePerShare("100", new Decimal(-1))).toBeUndefined();
  });

  it("accepts a Decimal spend", () => {
    expect(effectivePricePerShare(new Decimal("10"), new Decimal("4"))?.toFixed()).toBe("2.5");
  });
});

describe("quoteAgeSeconds", () => {
  it("measures whole seconds", () => {
    const now = new Date("2026-10-02T12:00:30.000Z");
    expect(quoteAgeSeconds("2026-10-02T12:00:00.000Z", now)).toBe(30);
    expect(quoteAgeSeconds(new Date("2026-10-02T12:00:29.600Z"), now)).toBe(0);
  });

  it("reports a future timestamp as negative rather than clamping", () => {
    const now = new Date("2026-10-02T12:00:00.000Z");
    expect(quoteAgeSeconds("2026-10-02T12:00:05.000Z", now)).toBe(-5);
  });

  it("throws on an invalid date", () => {
    expect(() => quoteAgeSeconds("not-a-date", new Date())).toThrow(/not a valid date/);
  });
});

describe("deviationBps", () => {
  it("computes bps exactly", () => {
    // 1000 / 1000000 = 0.1% = 10 bps.
    expect(deviationBps(new Decimal("1001000"), new Decimal("1000000"))?.toFixed()).toBe("10");
    expect(deviationBps(new Decimal("99"), new Decimal("100"))?.toFixed()).toBe("-100");
  });

  it("returns undefined against a zero benchmark", () => {
    expect(deviationBps(new Decimal("1"), new Decimal("0"))).toBeUndefined();
  });

  it("reproduces the live PPLTon deviation", () => {
    const implied = new Decimal("15.7309885943999994115");
    const bench = new Decimal("15.709643");
    expect(deviationBps(implied, bench)?.toFixed(1)).toBe("13.6");
  });
});

describe("priceImpactPercentToBps", () => {
  it("converts percent to bps", () => {
    expect(priceImpactPercentToBps("0.04")?.toFixed()).toBe("4");
    expect(priceImpactPercentToBps("1")?.toFixed()).toBe("100");
    expect(priceImpactPercentToBps("-0.5")?.toFixed()).toBe("-50");
  });

  it("returns undefined for absent or non-numeric values rather than zero", () => {
    for (const v of [null, undefined, "", "  ", "abc", "1e2"]) {
      expect(priceImpactPercentToBps(v)).toBeUndefined();
    }
  });

  it("distinguishes a real zero from an absent value", () => {
    expect(priceImpactPercentToBps("0")?.toFixed()).toBe("0");
    expect(priceImpactPercentToBps(null)).toBeUndefined();
  });
});

describe("toSmallestUnit", () => {
  it("scales exactly at 18 decimals", () => {
    expect(toSmallestUnit("100", 18)).toBe("100000000000000000000");
    expect(toSmallestUnit("0.5", 18)).toBe("500000000000000000");
  });

  it("refuses to truncate an inexpressible amount", () => {
    expect(() => toSmallestUnit("0.001", 2)).toThrow(/not expressible in whole smallest units/);
  });

  it("rejects malformed amounts and decimals", () => {
    expect(() => toSmallestUnit("-1", 18)).toThrow(/plain decimal/);
    expect(() => toSmallestUnit("1e3", 18)).toThrow(/plain decimal/);
    expect(() => toSmallestUnit("1", 1.5)).toThrow(/decimals/);
  });
});
