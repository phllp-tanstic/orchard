import { describe, expect, it } from "vitest";
import {
  REJECTION_REASON_CODES,
  type CandidateRoute,
  type RouteDecision,
} from "@orchard/execution";
import { REASON_TEXT, buildPreviewDto, reasonText, toCandidateDto } from "./dto";

/** A minimal candidate. Only the fields a DTO reads are set. */
function candidate(overrides: Partial<CandidateRoute> = {}): CandidateRoute {
  return {
    id: "c1",
    intentId: "i1",
    representationId: "56:0xaaa",
    platformId: "ondo",
    underlyingTicker: "NVDA",
    tokenSymbol: "NVDAon",
    tokenContractAddress: "0xaaa",
    binanceChainId: "56",
    assetType: 1,
    assetTypeLabel: "Stock",
    tokenToShareRatio: "1",
    quoteProvider: "BINANCE_WEB3",
    inputAmount: "100000000000000000000",
    inputAmountDecimal: "100",
    eligibility: "ELIGIBLE",
    rejectionReasons: [],
    ...overrides,
  };
}

function decision(overrides: Partial<RouteDecision> = {}): RouteDecision {
  return {
    intentId: "i1",
    selectedCandidateId: "c1",
    algorithmVersion: "f002-rank-1.0.0",
    rankedCandidateIds: ["c1"],
    reasonCodes: ["NORMALIZED_SHARES_DESC"],
    decidedAt: "2026-10-02T12:00:02.000Z",
    outcome: "SELECTED",
    ...overrides,
  };
}

describe("reason mapping (F003 T5)", () => {
  it("has plain language for EVERY engine rejection code", () => {
    // If the engine gains a code, this fails rather than letting the UI show a
    // raw identifier to a non-technical reader.
    for (const code of REJECTION_REASON_CODES) {
      const text = REASON_TEXT[code];
      expect(text, `missing plain language for ${code}`).toBeTruthy();
      expect(text.length).toBeGreaterThan(15);
      // The plain language must not simply echo the code.
      expect(text).not.toContain(code);
    }
  });

  it("covers every decision reason code the engine emits", () => {
    for (const code of [
      "NORMALIZED_SHARES_DESC",
      "EXPLICIT_FEES_ASC",
      "QUOTE_FRESHNESS_ASC",
      "PRICE_IMPACT_ASC",
      "TOKEN_ADDRESS_LEXICOGRAPHIC",
      "SOLE_ELIGIBLE_CANDIDATE",
      "NO_REPRESENTATIONS",
    ]) {
      expect(reasonText(code)).not.toContain("The engine reported");
    }
  });

  it("surfaces an unmapped code rather than inventing a sentence for it", () => {
    expect(reasonText("SOME_FUTURE_CODE")).toBe("The engine reported SOME_FUTURE_CODE.");
  });

  it("retains the RAW code alongside the plain language", () => {
    const dto = toCandidateDto(
      candidate({
        eligibility: "REJECTED",
        rejectionReasons: [{ code: "NON_TRADING_SESSION", providerCode: "40367" }],
      }),
    );
    expect(dto.reasons).toEqual([REASON_TEXT.NON_TRADING_SESSION]);
    expect(dto.reasonCodes).toEqual(["NON_TRADING_SESSION"]);
    expect(dto.providerCodes).toEqual(["40367"]);
  });

  it("says a deep discount is suspect, not a bargain", () => {
    // Wording matters: a reader could otherwise read the rejection as Orchard
    // throwing away free money.
    expect(REASON_TEXT.REFERENCE_DISCOUNT_SUSPECT).toMatch(/broken quote/);
    expect(REASON_TEXT.REFERENCE_DISCOUNT_SUSPECT).not.toMatch(/bargain price|good deal/);
  });
});

describe("toCandidateDto", () => {
  it("passes provider decimal strings through untouched", () => {
    const dto = toCandidateDto(
      candidate({
        normalizedExpectedShares: "0.42417911924005988965",
        effectivePricePerShare: "235.7494639980286481",
        referencePrice: "236.19",
        referenceDeviationBps: "-18.651763494277992294",
        priceImpactBps: "106.9987",
        tradeFee: "0.01931007",
        estimateGasFee: "450000",
      }),
    );
    expect(dto.estimatedShares).toBe("0.42417911924005988965");
    expect(dto.estimatedPricePerShare).toBe("235.7494639980286481");
    expect(dto.deviationBps).toBe("-18.651763494277992294");
    expect(dto.priceImpactBps).toBe("106.9987");
  });

  it("omits absent values rather than sending zero or empty strings", () => {
    const dto = toCandidateDto(candidate({ tradeFee: null, estimateGasFee: "" }));
    expect(dto.estimatedShares).toBeUndefined();
    expect(dto.tradeFee).toBeUndefined();
    expect(dto.networkFee).toBeUndefined();
  });

  it("carries the DEC-037 referenceUnavailable flag", () => {
    expect(toCandidateDto(candidate({ referenceUnavailable: true })).referenceUnavailable).toBe(
      true,
    );
    expect(toCandidateDto(candidate()).referenceUnavailable).toBe(false);
  });
});

describe("buildPreviewDto", () => {
  const base = {
    ticker: "NVDA",
    companyName: "Nvidia Corp",
    assetTypeLabel: "Stock",
    amount: "100",
    spendAssetSymbol: "USDT",
    maxQuoteAgeSeconds: 20,
  };

  it("derives expiresAt from the OLDEST quote, not the newest", () => {
    // The preview is only as fresh as its weakest leg; using the newest would
    // overstate how long the whole comparison is good for.
    const dto = buildPreviewDto({
      ...base,
      candidates: [
        candidate({ id: "c1", quoteTimestamp: "2026-10-02T12:00:10.000Z" }),
        candidate({ id: "c2", quoteTimestamp: "2026-10-02T12:00:00.000Z" }),
      ],
      decision: decision(),
    });
    expect(dto.quotedAt).toBe("2026-10-02T12:00:00.000Z");
    expect(dto.expiresAt).toBe("2026-10-02T12:00:20.000Z");
  });

  it("includes a winner only when one was selected", () => {
    const dto = buildPreviewDto({
      ...base,
      candidates: [candidate({ normalizedExpectedShares: "0.4", effectivePricePerShare: "250" })],
      decision: decision(),
    });
    expect(dto.outcome).toBe("SELECTED");
    expect(dto.winner?.estimatedShares).toBe("0.4");
    expect(dto.winner?.platform).toBe("ondo");
  });

  it("has NO winner and every reason on NO_ELIGIBLE_ROUTE", () => {
    const dto = buildPreviewDto({
      ...base,
      candidates: [
        candidate({
          eligibility: "REJECTED",
          rejectionReasons: [{ code: "NON_TRADING_SESSION", providerCode: "40367" }],
        }),
      ],
      decision: decision({
        outcome: "NO_ELIGIBLE_ROUTE",
        selectedCandidateId: null,
        rankedCandidateIds: [],
        reasonCodes: ["NON_TRADING_SESSION"],
      }),
    });
    expect(dto.winner).toBeUndefined();
    expect(dto.decisionReasons).toEqual([REASON_TEXT.NON_TRADING_SESSION]);
    expect(dto.decisionReasonCodes).toEqual(["NON_TRADING_SESSION"]);
  });

  it("omits a winner when the selected candidate has no economics", () => {
    // Defensive: a selected id with no shares must not produce a winner block
    // with undefined numbers rendered as blanks.
    const dto = buildPreviewDto({
      ...base,
      candidates: [candidate({ id: "c1" })],
      decision: decision(),
    });
    expect(dto.outcome).toBe("SELECTED");
    expect(dto.winner).toBeUndefined();
  });

  it("returns no expiry when no quote carried a timestamp", () => {
    const dto = buildPreviewDto({
      ...base,
      candidates: [candidate()],
      decision: decision(),
    });
    expect(dto.quotedAt).toBeUndefined();
    expect(dto.expiresAt).toBeUndefined();
  });

  it("carries the execution_request id so the screen can be reconciled", () => {
    const dto = buildPreviewDto({
      ...base,
      candidates: [candidate()],
      decision: decision(),
      executionRequestId: "req-1",
    });
    expect(dto.executionRequestId).toBe("req-1");
  });

  it("never includes a raw secret-looking field", () => {
    const dto = buildPreviewDto({
      ...base,
      candidates: [candidate({ quoteId: "abc123" })],
      decision: decision(),
    });
    const json = JSON.stringify(dto);
    // Signing primitives are enumerated once, in the client-bundle scan - the
    // no-signing guard allowlists exactly that one file, and naming them here
    // too would mean a second exemption for no extra coverage.
    for (const needle of ["apiKey", "apiSecret", "quoteId", "abc123"]) {
      expect(json).not.toContain(needle);
    }
  });
});
