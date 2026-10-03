import "dotenv/config";
import { Pool } from "pg";
import {
  closeProbeRun,
  insertPlatformSnapshots,
  insertTokenSnapshots,
  openProbeRun,
  recordProviderCall,
} from "@orchard/evidence";
import type { ProviderCallRecord } from "@orchard/binance";

/**
 * TEST-ONLY synthetic universe snapshot, for the STUBBED browser tests in CI
 * (F003 hardening item 6).
 *
 * The stubbed browser tests need a company to navigate to, but CI must make no
 * live provider call (AGENTS.md), so it cannot run `pnpm universe:refresh`.
 * This writes one obviously synthetic company through the SAME writer the real
 * pipeline uses, so the views, the repository and the pages are exercised for
 * real against real Postgres - only the provider is absent.
 *
 * Nothing here is imported from `src`, and every value is prefixed SYNTHETIC_
 * or is a visibly fake address, so a row from this seed can never be mistaken
 * for a provider observation in the evidence store. The ticker is SYNTH, never
 * a real one: a synthetic NVDA row would be indistinguishable from a real
 * measurement when someone later reads the database.
 */

const TICKER = "SYNTH";
const PLATFORMS = ["synthplatform-a", "synthplatform-b"] as const;

function syntheticCallRecord(endpoint: string): ProviderCallRecord {
  return {
    provider: "binance",
    method: "GET",
    endpoint,
    attempt: 1,
    httpStatus: 200,
    providerCode: "0",
    latencyMs: 0,
    rateLimitHeaders: {},
    networkError: undefined,
    timestamp: new Date().toISOString(),
    requestQuery: undefined,
    requestBody: undefined,
    // Marked in the stored evidence itself, not only in this file's name.
    rawResponseBody: JSON.stringify({ note: "SYNTHETIC_E2E_SEED - not a provider response" }),
    responseJson: { note: "SYNTHETIC_E2E_SEED - not a provider response" },
  };
}

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL is required to seed the synthetic universe.");
  }
  const pool = new Pool({ connectionString });
  try {
    const probeRunId = await openProbeRun(pool, {
      gitSha: process.env["GITHUB_SHA"] ?? "synthetic-seed",
      clientVersion: "0.0.0-synthetic-e2e-seed",
    });
    const salt = process.env["EVIDENCE_REDACTION_SALT"] ?? "synthetic-e2e-seed-salt";

    const platformsCallId = await recordProviderCall(
      pool,
      probeRunId,
      syntheticCallRecord("/api/v1/dex/market/rwa/platforms"),
      { salt },
    );
    await insertPlatformSnapshots(pool, {
      probeRunId,
      providerCallId: platformsCallId,
      rows: PLATFORMS.map((platformId) => ({
        platformId,
        platformName: `SYNTHETIC_${platformId}`,
        raw: { platformId, note: "SYNTHETIC_E2E_SEED" },
      })),
    });

    const tokensCallId = await recordProviderCall(
      pool,
      probeRunId,
      syntheticCallRecord("/api/v1/dex/market/rwa/tokens"),
      { salt },
    );
    await insertTokenSnapshots(pool, {
      probeRunId,
      providerCallId: tokensCallId,
      rows: PLATFORMS.map((platformId, index) => ({
        platformId,
        tokenContractAddress: `0xsynthetic00000000000000000000000000000${index}`,
        binanceChainId: "56",
        underlyingTicker: TICKER,
        underlyingName: "SYNTHETIC Test Company",
        assetType: 1,
        // One open, one closed, so the market-status rendering is exercised.
        marketStatus: index === 0 ? "regular" : "closed",
        tokenToShareRatio: "1",
        tokenPrice: "100",
        referencePrice: "100",
        tokenPriceUpdatedAt: new Date(),
        raw: {
          tokenSymbol: `SYNTH${index}`,
          decimals: "18",
          note: "SYNTHETIC_E2E_SEED",
        },
      })),
    });

    // COMPLETE, or rwa.latest_complete_snapshot_run correctly ignores it and
    // the seed would appear to have done nothing.
    await closeProbeRun(pool, { probeRunId, status: "COMPLETE" });

    const counts = await pool.query<{ unders: string; reps: string }>(
      "SELECT (SELECT count(*) FROM rwa.underlying_current) unders, (SELECT count(*) FROM rwa.universe_current) reps",
    );
    console.warn(
      `[SYNTHETIC_universe-seed] run ${probeRunId} COMPLETE: ` +
        `${counts.rows[0]?.unders ?? "?"} underlyings, ${counts.rows[0]?.reps ?? "?"} representations (ticker ${TICKER})`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[SYNTHETIC_universe-seed] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
