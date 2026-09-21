import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { ProviderCallRecord } from "@orchard/binance";
import { openProbeRun, recordProviderCall } from "./recorder.js";

/**
 * Migration 006 (DEC-013 hardening): rwa.platform_snapshot and
 * rwa.token_snapshot become append-only like evidence.*, and
 * token_snapshot.binance_chain_id widens from integer to text so it can
 * hold a non-numeric chain id (e.g. Solana's "CT_501"), matching the RWA
 * data API's documented string type (packages/rwa's zod schemas).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for integration tests`);
  return value;
}

const migratorPool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
const appPool = new Pool({ connectionString: requireEnv("ORCHARD_APP_DATABASE_URL") });

afterAll(async () => {
  await migratorPool.end();
  await appPool.end();
});

function sampleCallRecord(): ProviderCallRecord {
  return {
    provider: "binance",
    method: "GET",
    endpoint: "/build/api/v1/dex/market/rwa/tokens",
    attempt: 1,
    httpStatus: 200,
    providerCode: "0",
    latencyMs: 10,
    rateLimitHeaders: {},
    networkError: undefined,
    timestamp: new Date().toISOString(),
    requestQuery: undefined,
    requestBody: undefined,
    rawResponseBody: "{}",
    responseJson: {},
  };
}

async function seedProbeRunAndProviderCall(): Promise<{
  probeRunId: string;
  providerCallId: string;
}> {
  const probeRunId = await openProbeRun(appPool, { gitSha: "x", clientVersion: "0.0.0-test" });
  const providerCallId = await recordProviderCall(appPool, probeRunId, sampleCallRecord(), {
    salt: "integration-test-salt",
  });
  return { probeRunId, providerCallId };
}

async function insertPlatformSnapshot(probeRunId: string, providerCallId: string): Promise<string> {
  const result = await appPool.query<{ id: string }>(
    `INSERT INTO rwa.platform_snapshot (probe_run_id, provider_call_id, platform_id, platform_name, raw)
     VALUES ($1, $2, 'PLATFORM_1', 'Platform One', '{}'::jsonb)
     RETURNING id`,
    [probeRunId, providerCallId],
  );
  return result.rows[0]!.id;
}

async function insertTokenSnapshot(
  probeRunId: string,
  providerCallId: string,
  binanceChainId: string,
): Promise<string> {
  const result = await appPool.query<{ id: string }>(
    `INSERT INTO rwa.token_snapshot
      (probe_run_id, provider_call_id, platform_id, token_address, binance_chain_id,
       token_to_share_ratio_raw, token_to_share_ratio, raw)
     VALUES ($1, $2, 'PLATFORM_1', '0xABC', $3, '1', 1, '{}'::jsonb)
     RETURNING id`,
    [probeRunId, providerCallId, binanceChainId],
  );
  return result.rows[0]!.id;
}

describe("rwa.*_snapshot hardening (DEC-013, migration 006)", () => {
  it("accepts a non-numeric binance_chain_id such as Solana's CT_501", async () => {
    const { probeRunId, providerCallId } = await seedProbeRunAndProviderCall();
    const id = await insertTokenSnapshot(probeRunId, providerCallId, "CT_501");
    expect(id).toBeTruthy();

    const row = await appPool.query<{ binance_chain_id: string }>(
      `SELECT binance_chain_id FROM rwa.token_snapshot WHERE id = $1`,
      [id],
    );
    expect(row.rows[0]?.binance_chain_id).toBe("CT_501");
  });

  it("still accepts a numeric-looking binance_chain_id like '56' (now stored as text)", async () => {
    const { probeRunId, providerCallId } = await seedProbeRunAndProviderCall();
    const id = await insertTokenSnapshot(probeRunId, providerCallId, "56");
    const row = await appPool.query<{ binance_chain_id: string }>(
      `SELECT binance_chain_id FROM rwa.token_snapshot WHERE id = $1`,
      [id],
    );
    expect(row.rows[0]?.binance_chain_id).toBe("56");
  });

  it("rejects UPDATE, DELETE and TRUNCATE on rwa.platform_snapshot even as the owning role", async () => {
    const { probeRunId, providerCallId } = await seedProbeRunAndProviderCall();
    await insertPlatformSnapshot(probeRunId, providerCallId);

    await expect(
      migratorPool.query(`UPDATE rwa.platform_snapshot SET platform_name = 'tampered' WHERE true`),
    ).rejects.toThrow(/append-only/);
    await expect(
      migratorPool.query(`DELETE FROM rwa.platform_snapshot WHERE true`),
    ).rejects.toThrow(/append-only/);
    await expect(migratorPool.query(`TRUNCATE rwa.platform_snapshot`)).rejects.toThrow(
      /append-only/,
    );
  });

  it("rejects UPDATE, DELETE and TRUNCATE on rwa.token_snapshot even as the owning role", async () => {
    const { probeRunId, providerCallId } = await seedProbeRunAndProviderCall();
    await insertTokenSnapshot(probeRunId, providerCallId, "56");

    await expect(
      migratorPool.query(`UPDATE rwa.token_snapshot SET binance_chain_id = 'tampered' WHERE true`),
    ).rejects.toThrow(/append-only/);
    await expect(migratorPool.query(`DELETE FROM rwa.token_snapshot WHERE true`)).rejects.toThrow(
      /append-only/,
    );
    await expect(migratorPool.query(`TRUNCATE rwa.token_snapshot`)).rejects.toThrow(/append-only/);
  });

  it("orchard_app can INSERT but not UPDATE or DELETE rwa.platform_snapshot/token_snapshot", async () => {
    await expect(
      appPool.query(`UPDATE rwa.platform_snapshot SET platform_name = 'x' WHERE true`),
    ).rejects.toThrow(/permission denied/);
    await expect(appPool.query(`DELETE FROM rwa.token_snapshot WHERE true`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
