import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { unknownObjectKeys } from "@orchard/rwa";
import { BinanceApiError } from "./errors.js";
import { TRANSACTION_PATHS, buildSimulateRequest } from "./transaction-requests.js";
import {
  DOCUMENTED_SIMULATE_STATUSES,
  isDocumentedSimulateStatus,
  simulateDataSchema,
} from "./transaction-schemas.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "..", "test", "fixtures", "SYNTHETIC_trading_payloads.json");

function loadSimulateData(): Record<string, unknown> {
  return (
    JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { simulateData: Record<string, unknown> }
  ).simulateData;
}

describe("buildSimulateRequest", () => {
  it("POSTs to the path verified on the live Transaction API doc page, not the spec placeholder", () => {
    const spec = buildSimulateRequest({
      binanceChainId: "56",
      evmTx: { from: "0xwallet", to: "0xtoken", value: "0", data: "0x095ea7b3" },
    });
    expect(spec.method).toBe("POST");
    expect(spec.path).toBe("/api/v1/dex/pre-transaction/simulate");
    expect(spec.path).toBe(TRANSACTION_PATHS.simulate);
    expect(spec.path).not.toBe("/transaction/simulate");
  });

  it("sends exactly the four documented evmTx fields in the body", () => {
    const spec = buildSimulateRequest({
      binanceChainId: "56",
      evmTx: { from: "0xwallet", to: "0xtoken", value: "0", data: "0x095ea7b3" },
    });
    expect(spec.body).toEqual({
      binanceChainId: "56",
      evmTx: { from: "0xwallet", to: "0xtoken", value: "0", data: "0x095ea7b3" },
    });
    expect(spec.query).toBeUndefined();
  });

  it("rejects a wei value that is not an integer string", () => {
    for (const value of ["0.1", "1e18", "-1", "", "0x0"]) {
      expect(() =>
        buildSimulateRequest({
          binanceChainId: "56",
          evmTx: { from: "0xwallet", to: "0xtoken", value, data: "0x095ea7b3" },
        }),
      ).toThrow(/evmTx.value must be a wei integer string/);
    }
  });

  it("rejects empty required fields", () => {
    expect(() =>
      buildSimulateRequest({
        binanceChainId: "56",
        evmTx: { from: "0xwallet", to: "", value: "0", data: "0x1" },
      }),
    ).toThrow(/evmTx.to must not be empty/);
    expect(() =>
      buildSimulateRequest({
        binanceChainId: "56",
        evmTx: { from: "0xwallet", to: "0xtoken", value: "0", data: "" },
      }),
    ).toThrow(/evmTx.data must not be empty/);
  });
});

describe("simulateDataSchema", () => {
  it("parses a documented-shape simulate result", () => {
    const parsed = simulateDataSchema.parse(loadSimulateData());
    expect(parsed.status).toBe("SUCCESS");
    expect(parsed.failReason).toBeNull();
    expect(parsed.balanceChanges?.[0]?.change).toBe("-10000000");
    expect(parsed.allowanceChanges?.[0]?.postAmount).toBe("10000000");
    expect(isDocumentedSimulateStatus(parsed.status)).toBe(true);
  });

  it("accepts a status outside the documented set and reports it as undocumented", () => {
    const parsed = simulateDataSchema.parse({ ...loadSimulateData(), status: "REVERTED" });
    expect(parsed.status).toBe("REVERTED");
    expect(isDocumentedSimulateStatus("REVERTED")).toBe(false);
    expect(DOCUMENTED_SIMULATE_STATUSES).toEqual(["SUCCESS"]);
  });

  it("fails visibly when status is missing entirely", () => {
    const data = { ...loadSimulateData() };
    delete data["status"];
    expect(() => simulateDataSchema.parse(data)).toThrow(ZodError);
  });

  it("keeps and reports unknown fields", () => {
    const raw = { ...loadSimulateData(), gasUsed: "21000" };
    simulateDataSchema.parse(raw);
    expect(unknownObjectKeys(simulateDataSchema.shape, raw)).toEqual(["gasUsed"]);
  });
});

describe("simulate errors map onto the existing typed-error set", () => {
  it("a non-zero envelope code from the simulate endpoint is a BinanceApiError", () => {
    const err = new BinanceApiError({ code: "50000", message: "internal" }, 200);
    expect(err).toBeInstanceOf(BinanceApiError);
    expect(err.code).toBe("50000");
    expect(err.documented).toBe(true);
    expect(err.isRetryable()).toBe(true);
  });

  it("an undocumented code is flagged undocumented rather than swallowed", () => {
    const err = new BinanceApiError({ code: "49999", message: "who knows" }, 200);
    expect(err.documented).toBe(false);
  });
});
