import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { runRwaUniverseProbe, type EvidenceOps, type RequestClient, type RequestSpec } from "./pipeline.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORMS_FIXTURE = JSON.parse(
  readFileSync(join(HERE, "..", "test", "fixtures", "DOC_EXAMPLE_platforms.json"), "utf8"),
) as unknown[];

function ondoToken(overrides: Record<string, unknown> = {}) {
  return {
    binanceChainId: "56",
    tokenContractAddress: "0x1111111111111111111111111111111111111a",
    platformId: "ondo",
    assetType: 1,
    tokenName: "Example Stock A (Ondo)",
    tokenSymbol: "EXAo",
    tokenLogoUrl: "https://example.invalid/exa.png",
    decimals: "18",
    underlyingTicker: "EXA",
    underlyingName: "Example Corp",
    underlyingNameZh: null,
    tokenToShareRatio: "1",
    tags: null,
    statusInfo: {
      openState: true,
      marketStatus: "regular",
      reasonCode: null,
      reasonMsg: null,
      nextOpenTime: null,
      nextCloseTime: null,
    },
    tokenPrice: "100.00",
    referencePrice: "100.01",
    volume24H: "1000",
    marketCap: "1000000",
    peRatioTTM: null,
    ...overrides,
  };
}

function bstockToken(overrides: Record<string, unknown> = {}) {
  return {
    binanceChainId: "56",
    tokenContractAddress: "0x2222222222222222222222222222222222222b",
    platformId: "bstock",
    assetType: 1,
    tokenName: "Example Stock A (bStock)",
    tokenSymbol: "EXAb",
    tokenLogoUrl: "https://example.invalid/exa2.png",
    decimals: "18",
    underlyingTicker: "EXA",
    underlyingName: "Example Corp",
    underlyingNameZh: null,
    tokenToShareRatio: "0.1",
    tags: null,
    statusInfo: {
      openState: true,
      marketStatus: "regular",
      reasonCode: null,
      reasonMsg: null,
      nextOpenTime: null,
      nextCloseTime: null,
    },
    tokenPrice: "10.00",
    referencePrice: "10.001",
    volume24H: "500",
    marketCap: "500000",
    peRatioTTM: null,
    ...overrides,
  };
}

function priceFor(token: ReturnType<typeof ondoToken>, updatedAt: number) {
  return {
    binanceChainId: token["binanceChainId"],
    tokenContractAddress: token["tokenContractAddress"],
    platformId: token["platformId"],
    tokenPrice: token["tokenPrice"],
    referencePrice: token["referencePrice"],
    tokenPriceUpdatedAt: updatedAt,
  };
}

function profileFor(token: ReturnType<typeof ondoToken>, ratioOverride?: string) {
  return {
    binanceChainId: token["binanceChainId"],
    tokenContractAddress: token["tokenContractAddress"],
    platformId: token["platformId"],
    underlyingTicker: token["underlyingTicker"],
    underlyingFullName: token["underlyingName"],
    assetType: token["assetType"],
    tokenToShareRatio: ratioOverride ?? (token["tokenToShareRatio"] as string),
    protections: {},
    companyInfo: null,
  };
}

/** Fake evidence ops - no DB. Verifies open/close lifecycle without a Postgres instance. */
function fakeEvidence(): EvidenceOps & { openedWith: unknown[]; closedWith: unknown[] } {
  const openedWith: unknown[] = [];
  const closedWith: unknown[] = [];
  return {
    openedWith,
    closedWith,
    openProbeRun: (args) => {
      openedWith.push(args);
      return Promise.resolve("fake-run-id");
    },
    closeProbeRun: (args) => {
      closedWith.push(args);
      return Promise.resolve();
    },
  };
}

function happyPathClient(now: number): RequestClient {
  const ondo = ondoToken();
  const bstock = bstockToken();
  return {
    request: <T>(spec: RequestSpec) => {
      if (spec.path === "/api/v1/dex/market/rwa/platforms") {
        return Promise.resolve({ data: PLATFORMS_FIXTURE as T });
      }
      if (spec.path === "/api/v1/dex/market/rwa/tokens") {
        const platformId = spec.query?.["platformId"];
        const data = platformId === "ondo" ? [ondo] : platformId === "bstock" ? [bstock] : [];
        return Promise.resolve({ data: data as T });
      }
      if (spec.path === "/api/v1/dex/market/rwa/underlying-profile") {
        const address = spec.query?.["tokenContractAddress"];
        const token = address === ondo.tokenContractAddress ? ondo : bstock;
        return Promise.resolve({ data: profileFor(token) as T });
      }
      if (spec.path === "/api/v1/dex/market/rwa/price") {
        const addresses = String(spec.query?.["tokenContractAddresses"]).split(",");
        const data = [ondo, bstock]
          .filter((t) => addresses.includes(t.tokenContractAddress))
          .map((t) => priceFor(t, now));
        return Promise.resolve({ data: data as T });
      }
      throw new Error(`unexpected request in test: ${spec.method} ${spec.path}`);
    },
  };
}

describe("runRwaUniverseProbe - happy path", () => {
  it("produces a COMPLETE report with correct grouping, reconciliation, and price analysis", async () => {
    const now = Date.UTC(2026, 8, 21, 12, 0, 0);
    const evidence = fakeEvidence();
    const result = await runRwaUniverseProbe({
      client: happyPathClient(now),
      evidence,
      gitSha: "test-sha",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
      now: () => new Date(now),
    });

    expect(result.status).toBe("COMPLETE");
    expect(result.incompleteReasons).toEqual([]);
    expect(result.report.totalRepresentations).toBe(2);
    expect(result.report.uniqueUnderlyings).toBe(1);
    expect(result.report.multiRepresentationUnderlyings).toEqual(["EXA"]);
    expect(result.report.platformCounts).toEqual({ ondo: 1, bstock: 1 });
    expect(result.report.reconciliation.every((r) => r.ok)).toBe(true);
    expect(result.report.ratioAnomalies).toEqual([]);
    expect(result.report.staleness).toHaveLength(2);
    expect(result.report.staleness[0]!.ageSeconds).toBe(0);
    expect(evidence.openedWith).toEqual([{ gitSha: "test-sha", clientVersion: "0.0.0-test" }]);
    expect(evidence.closedWith).toEqual([{ probeRunId: "fake-run-id", status: "COMPLETE" }]);
  });
});

describe("runRwaUniverseProbe - schema drift propagation", () => {
  it("records an incomplete reason and does not throw when a token fails schema validation", async () => {
    const now = Date.UTC(2026, 8, 21, 12, 0, 0);
    const badOndo = ondoToken();
    delete (badOndo as Record<string, unknown>)["tokenToShareRatio"];
    const client: RequestClient = {
      request: <T>(spec: RequestSpec) => {
        if (spec.path === "/api/v1/dex/market/rwa/platforms") {
          return Promise.resolve({ data: PLATFORMS_FIXTURE as T });
        }
        if (spec.path === "/api/v1/dex/market/rwa/tokens") {
          const platformId = spec.query?.["platformId"];
          const data = platformId === "ondo" ? [badOndo] : [bstockToken()];
          return Promise.resolve({ data: data as T });
        }
        if (spec.path === "/api/v1/dex/market/rwa/price") {
          return Promise.resolve({ data: [] as T });
        }
        return Promise.resolve({ data: [] as T });
      },
    };

    const result = await runRwaUniverseProbe({
      client,
      evidence: fakeEvidence(),
      gitSha: "test-sha",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
      now: () => new Date(now),
    });

    expect(result.status).toBe("INCOMPLETE");
    expect(result.incompleteReasons.some((r) => r.includes("ondo"))).toBe(true);
    // bstock still succeeded independently
    expect(result.report.platformCounts["bstock"]).toBe(1);
  });
});

describe("runRwaUniverseProbe - reconciliation", () => {
  it("flags a reconciliation mismatch and marks the run INCOMPLETE (universe untrusted)", async () => {
    const now = Date.UTC(2026, 8, 21, 12, 0, 0);
    const client: RequestClient = {
      request: <T>(spec: RequestSpec) => {
        if (spec.path === "/api/v1/dex/market/rwa/platforms") {
          return Promise.resolve({ data: PLATFORMS_FIXTURE as T });
        }
        if (spec.path === "/api/v1/dex/market/rwa/tokens") {
          const platformId = spec.query?.["platformId"];
          // ondo's fixture says tokenCount: 1 for chain 56, but we return 0 tokens - mismatch.
          const data = platformId === "ondo" ? [] : [bstockToken()];
          return Promise.resolve({ data: data as T });
        }
        return Promise.resolve({ data: [] as T });
      },
    };

    const result = await runRwaUniverseProbe({
      client,
      evidence: fakeEvidence(),
      gitSha: "test-sha",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
      now: () => new Date(now),
    });

    expect(result.status).toBe("INCOMPLETE");
    expect(result.report.reconciliation.find((r) => r.platformId === "ondo")?.ok).toBe(false);
    expect(result.incompleteReasons.some((r) => r.includes("reconciliation mismatch"))).toBe(true);
  });
});

describe("runRwaUniverseProbe - conflict flags", () => {
  it("flags a conflicting underlyingName within a ticker as an incomplete reason", async () => {
    const now = Date.UTC(2026, 8, 21, 12, 0, 0);
    const conflictingBstock = bstockToken({ underlyingName: "Example Corp (renamed)" });
    const client: RequestClient = {
      request: <T>(spec: RequestSpec) => {
        if (spec.path === "/api/v1/dex/market/rwa/platforms") {
          return Promise.resolve({ data: PLATFORMS_FIXTURE as T });
        }
        if (spec.path === "/api/v1/dex/market/rwa/tokens") {
          const platformId = spec.query?.["platformId"];
          const data = platformId === "ondo" ? [ondoToken()] : [conflictingBstock];
          return Promise.resolve({ data: data as T });
        }
        if (spec.path === "/api/v1/dex/market/rwa/underlying-profile") {
          const address = spec.query?.["tokenContractAddress"];
          const token = address === ondoToken().tokenContractAddress ? ondoToken() : conflictingBstock;
          return Promise.resolve({ data: profileFor(token as never) as T });
        }
        return Promise.resolve({ data: [] as T });
      },
    };

    const result = await runRwaUniverseProbe({
      client,
      evidence: fakeEvidence(),
      gitSha: "test-sha",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
      now: () => new Date(now),
    });

    expect(result.status).toBe("INCOMPLETE");
    expect(result.incompleteReasons.some((r) => r.includes("conflicting underlyingName"))).toBe(
      true,
    );
  });
});

describe("runRwaUniverseProbe - fail-closed path", () => {
  it("marks the run FAILED and writes no report claiming completeness when platforms itself fails", async () => {
    const client: RequestClient = {
      request: () => {
        throw new Error("ECONNREFUSED: cannot reach Binance Web3 API");
      },
    };
    const evidence = fakeEvidence();

    const result = await runRwaUniverseProbe({
      client,
      evidence,
      gitSha: "test-sha",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
    });

    expect(result.status).toBe("FAILED");
    expect(result.incompleteReasons[0]).toContain("ECONNREFUSED");
    expect(result.report.status).toBe("FAILED");
    expect(result.report.totalRepresentations).toBe(0);
    expect(evidence.closedWith).toEqual([
      { probeRunId: "fake-run-id", status: "FAILED", incompleteReasons: [result.incompleteReasons[0]] },
    ]);
  });

  it("marks the run INCOMPLETE (not COMPLETE) when a downstream phase throws mid-pipeline", async () => {
    const now = Date.UTC(2026, 8, 21, 12, 0, 0);
    const client: RequestClient = {
      request: <T>(spec: RequestSpec) => {
        if (spec.path === "/api/v1/dex/market/rwa/platforms") {
          return Promise.resolve({ data: PLATFORMS_FIXTURE as T });
        }
        if (spec.path === "/api/v1/dex/market/rwa/tokens") {
          const platformId = spec.query?.["platformId"];
          if (platformId === "ondo") throw new Error("HTTP 500 from provider");
          return Promise.resolve({ data: [bstockToken()] as T });
        }
        return Promise.resolve({ data: [] as T });
      },
    };

    const result = await runRwaUniverseProbe({
      client,
      evidence: fakeEvidence(),
      gitSha: "test-sha",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
      now: () => new Date(now),
    });

    expect(result.status).toBe("INCOMPLETE");
    expect(result.status).not.toBe("COMPLETE");
    expect(result.incompleteReasons.some((r) => r.includes("HTTP 500"))).toBe(true);
  });
});

describe("runRwaUniverseProbe - unknown field reporting", () => {
  it("surfaces unknown extra fields in the report without dropping them", async () => {
    const now = Date.UTC(2026, 8, 21, 12, 0, 0);
    const ondoWithExtra = ondoToken({ tokenIssuerNote: "field added later by the docs" });
    const client: RequestClient = {
      request: <T>(spec: RequestSpec) => {
        if (spec.path === "/api/v1/dex/market/rwa/platforms") {
          return Promise.resolve({ data: PLATFORMS_FIXTURE as T });
        }
        if (spec.path === "/api/v1/dex/market/rwa/tokens") {
          const platformId = spec.query?.["platformId"];
          const data = platformId === "ondo" ? [ondoWithExtra] : [bstockToken()];
          return Promise.resolve({ data: data as T });
        }
        return Promise.resolve({ data: [] as T });
      },
    };

    const result = await runRwaUniverseProbe({
      client,
      evidence: fakeEvidence(),
      gitSha: "test-sha",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
      now: () => new Date(now),
    });

    expect(result.report.unknownFields["tokens:ondo"]).toEqual(["tokenIssuerNote"]);
  });
});

