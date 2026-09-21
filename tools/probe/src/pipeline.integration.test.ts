import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  openProbeRun,
  closeProbeRun,
  getProbeRunCurrent,
  recordProviderCall,
} from "@orchard/evidence";
import { runRwaUniverseProbe, type RequestClient, type RequestSpec } from "./pipeline.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for integration tests`);
  return value;
}

const appPool = new Pool({ connectionString: requireEnv("ORCHARD_APP_DATABASE_URL") });

afterAll(async () => {
  await appPool.end();
});

const PLATFORMS = [
  {
    platformId: "ondo",
    tickerCount: 1,
    chainDistribution: [{ binanceChainId: "56", tokenCount: 1 }],
    website: null,
    logoUrl: null,
  },
];

const TOKEN = {
  binanceChainId: "56",
  tokenContractAddress: "0x1111111111111111111111111111111111111a",
  platformId: "ondo",
  assetType: 1,
  tokenName: "Example Stock A",
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
};

function fakeClient(): RequestClient {
  return {
    request: <T>(spec: RequestSpec) => {
      if (spec.path === "/api/v1/dex/market/rwa/platforms") {
        return Promise.resolve({ data: PLATFORMS as T });
      }
      if (spec.path === "/api/v1/dex/market/rwa/tokens") {
        return Promise.resolve({ data: [TOKEN] as T });
      }
      if (spec.path === "/api/v1/dex/market/rwa/price") {
        return Promise.resolve({
          data: [
            {
              binanceChainId: TOKEN.binanceChainId,
              tokenContractAddress: TOKEN.tokenContractAddress,
              platformId: TOKEN.platformId,
              tokenPrice: TOKEN.tokenPrice,
              referencePrice: TOKEN.referencePrice,
              tokenPriceUpdatedAt: Date.now(),
            },
          ] as T,
        });
      }
      return Promise.resolve({ data: [] as T });
    },
  };
}

describe("runRwaUniverseProbe wired to the real evidence recorder (integration, real Postgres)", () => {
  it("opens a probe_run, records provider_call rows, and closes the run COMPLETE", async () => {
    const probeRunId = await openProbeRun(appPool, {
      gitSha: "pipeline-integration-test",
      clientVersion: "0.0.0-test",
    });

    const recordedCallIds: string[] = [];
    const instrumentedClient: RequestClient = {
      request: async <T>(spec: RequestSpec) => {
        const result = await fakeClient().request<T>(spec);
        const callId = await recordProviderCall(
          appPool,
          probeRunId,
          {
            provider: "binance",
            method: spec.method,
            endpoint: spec.path,
            attempt: 1,
            httpStatus: 200,
            providerCode: "0",
            latencyMs: 1,
            rateLimitHeaders: {},
            networkError: undefined,
            timestamp: new Date().toISOString(),
            requestQuery: spec.query,
            requestBody: undefined,
            rawResponseBody: JSON.stringify(result.data),
            responseJson: result.data,
          },
          { salt: "integration-test-salt" },
        );
        recordedCallIds.push(callId);
        return result;
      },
    };

    const result = await runRwaUniverseProbe({
      client: instrumentedClient,
      evidence: {
        openProbeRun: () => Promise.resolve(probeRunId),
        closeProbeRun: (args) => closeProbeRun(appPool, args),
      },
      gitSha: "pipeline-integration-test",
      clientVersion: "0.0.0-test",
      targetChainId: "56",
    });

    expect(result.status).toBe("COMPLETE");
    expect(recordedCallIds.length).toBeGreaterThan(0);

    const current = await getProbeRunCurrent(appPool, probeRunId);
    expect(current?.status).toBe("COMPLETE");

    const rows = await appPool.query(
      `SELECT count(*)::int AS n FROM evidence.provider_call WHERE probe_run_id = $1`,
      [probeRunId],
    );
    expect((rows.rows[0] as { n: number }).n).toBe(recordedCallIds.length);
  });
});
