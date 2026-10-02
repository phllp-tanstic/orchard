import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { ProviderCallRecord } from "@orchard/binance";
import { closeProbeRun, openProbeRun, recordProviderCall } from "./recorder.js";
import { createIsolatedDatabase, type IsolatedDatabase } from "./testing/isolation.js";

/**
 * Migration 010 (F003 T3): the read-only views the web app searches over.
 *
 * The correctness rule being tested is "the latest COMPLETE run that actually
 * wrote token rows". It lives in the view rather than in the app precisely so
 * that a FAILED or still-RUNNING run cannot become the universe, and that is
 * only provable against real Postgres - the app-side unit tests can assert
 * which view is queried, not what the view does.
 */

// DEC-017: this file gets its own database, cloned from a shared template.
let db: IsolatedDatabase;
let migratorPool: Pool;
let appPool: Pool;

beforeAll(async () => {
  db = await createIsolatedDatabase();
  migratorPool = db.migratorPool;
  appPool = db.appPool;
});

afterAll(async () => {
  await db.teardown();
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

interface TokenSeed {
  platformId: string;
  tokenAddress: string;
  ticker: string | null;
  fullName: string | null;
  assetType: number | null;
  marketStatus: string | null;
  ratioRaw: string;
  symbol?: string | undefined;
  decimals?: string | undefined;
}

/** Opens a run, writes the given token rows, and closes it with `status`. */
async function seedRun(
  status: "COMPLETE" | "INCOMPLETE" | undefined,
  tokens: readonly TokenSeed[],
): Promise<string> {
  const probeRunId = await openProbeRun(appPool, {
    gitSha: "integration",
    clientVersion: "0.0.0-test",
  });
  const providerCallId = await recordProviderCall(appPool, probeRunId, sampleCallRecord(), {
    salt: "integration-test-salt",
  });
  for (const t of tokens) {
    const raw: Record<string, string> = {};
    if (t.symbol !== undefined) raw["tokenSymbol"] = t.symbol;
    if (t.decimals !== undefined) raw["decimals"] = t.decimals;
    await appPool.query(
      `INSERT INTO rwa.token_snapshot
        (probe_run_id, provider_call_id, platform_id, token_address, binance_chain_id,
         underlying_ticker, underlying_full_name, asset_type, market_status,
         token_to_share_ratio_raw, token_to_share_ratio, raw)
       VALUES ($1, $2, $3, $4, '56', $5, $6, $7, $8, $9, $10::numeric, $11::jsonb)`,
      [
        probeRunId,
        providerCallId,
        t.platformId,
        t.tokenAddress,
        t.ticker,
        t.fullName,
        t.assetType,
        t.marketStatus,
        // The same value twice, as separate parameters: postgres deduces one
        // type per placeholder, so reusing $9 for text and numeric fails.
        t.ratioRaw,
        t.ratioRaw,
        JSON.stringify(raw),
      ],
    );
  }
  // `undefined` leaves the run RUNNING: no terminal event at all.
  if (status !== undefined) await closeProbeRun(appPool, { probeRunId, status });
  return probeRunId;
}

function nvda(overrides: Partial<TokenSeed> = {}): TokenSeed {
  return {
    platformId: "ondo",
    tokenAddress: "0xaaa",
    ticker: "NVDA",
    fullName: "NVIDIA Corporation",
    assetType: 1,
    marketStatus: "regular",
    ratioRaw: "1",
    symbol: "NVDAon",
    decimals: "18",
    ...overrides,
  };
}

describe("rwa.latest_complete_snapshot_run (migration 010)", () => {
  it("is empty before any run has written a snapshot", async () => {
    const res = await appPool.query("SELECT * FROM rwa.latest_complete_snapshot_run");
    expect(res.rowCount).toBe(0);
  });

  it("picks the COMPLETE run and IGNORES a later INCOMPLETE one", async () => {
    // The dangerous failure: a failed refresh overwriting a good universe.
    const good = await seedRun("COMPLETE", [nvda()]);
    await seedRun("INCOMPLETE", [nvda({ platformId: "bstock", tokenAddress: "0xbbb" })]);

    const res = await appPool.query<{ probe_run_id: string }>(
      "SELECT probe_run_id FROM rwa.latest_complete_snapshot_run",
    );
    expect(res.rows[0]?.probe_run_id).toBe(good);
  });

  it("IGNORES a still-RUNNING run, even though its rows are already stored", async () => {
    // Rows land as the pipeline walks the pages, so a half-written run is a
    // real state, not a hypothetical one.
    const good = await seedRun("COMPLETE", [nvda()]);
    await seedRun(undefined, [nvda({ platformId: "bstock", tokenAddress: "0xccc" })]);

    const res = await appPool.query<{ probe_run_id: string }>(
      "SELECT probe_run_id FROM rwa.latest_complete_snapshot_run",
    );
    expect(res.rows[0]?.probe_run_id).toBe(good);
  });

  it("IGNORES a COMPLETE run that wrote no token rows", async () => {
    // `pnpm probe:rwa` completes without snapshotting. If it won, the app
    // would show an empty universe and call it current.
    const withRows = await seedRun("COMPLETE", [nvda()]);
    await seedRun("COMPLETE", []);

    const res = await appPool.query<{ probe_run_id: string }>(
      "SELECT probe_run_id FROM rwa.latest_complete_snapshot_run",
    );
    expect(res.rows[0]?.probe_run_id).toBe(withRows);
  });

  it("returns exactly one row, the newest qualifying run", async () => {
    await seedRun("COMPLETE", [nvda()]);
    const newest = await seedRun("COMPLETE", [nvda({ tokenAddress: "0xddd" })]);

    const res = await appPool.query<{ probe_run_id: string }>(
      "SELECT probe_run_id FROM rwa.latest_complete_snapshot_run",
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0]?.probe_run_id).toBe(newest);
  });
});

describe("rwa.universe_current (migration 010)", () => {
  it("exposes only the latest complete run's representations", async () => {
    await seedRun("COMPLETE", [nvda({ tokenAddress: "0xold" })]);
    await seedRun("COMPLETE", [
      nvda({ tokenAddress: "0xnew" }),
      nvda({ platformId: "bstock", tokenAddress: "0xnew2", symbol: "NVDAx" }),
    ]);

    const res = await appPool.query<{ token_address: string }>(
      "SELECT token_address FROM rwa.universe_current ORDER BY token_address",
    );
    expect(res.rows.map((r) => r.token_address)).toEqual(["0xnew", "0xnew2"]);
  });

  it("reads tokenSymbol and decimals out of the stored provider object", async () => {
    // The snapshot table has no column for either; reading them from `raw`
    // is what lets the app avoid hardcoding 18 decimals.
    await seedRun("COMPLETE", [nvda({ symbol: "NVDAon", decimals: "6" })]);
    const res = await appPool.query<{ token_symbol: string; token_decimals: string }>(
      "SELECT token_symbol, token_decimals FROM rwa.universe_current",
    );
    expect(res.rows[0]?.token_symbol).toBe("NVDAon");
    expect(res.rows[0]?.token_decimals).toBe("6");
  });

  it("returns NULL decimals when the provider object omits them", async () => {
    // Null here is what makes the app leave decimals empty and the engine
    // reject the candidate, rather than assume a scale.
    await seedRun("COMPLETE", [nvda({ symbol: undefined, decimals: undefined })]);
    const res = await appPool.query<{ token_symbol: string | null; token_decimals: string | null }>(
      "SELECT token_symbol, token_decimals FROM rwa.universe_current",
    );
    expect(res.rows[0]?.token_decimals).toBeNull();
    expect(res.rows[0]?.token_symbol).toBeNull();
  });

  it("names the per-TOKEN price columns so the unit travels with the column", async () => {
    // F002 Amendment A1: /rwa/tokens referencePrice is per token. A column
    // called reference_price would read as the per-share benchmark, which is
    // the exact confusion that cost a day of F002.
    await seedRun("COMPLETE", [nvda()]);
    const columns = await migratorPool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'rwa' AND table_name = 'universe_current'`,
    );
    const names = columns.rows.map((r) => r.column_name);
    expect(names).toContain("reference_price_per_token_raw");
    expect(names).toContain("token_price_per_token_raw");
    expect(names).not.toContain("reference_price");
    expect(names).not.toContain("reference_price_per_share");
  });

  it("KEEPS a representation whose ticker or asset type is null", async () => {
    // These are excluded from the searchable aggregate, but they must stay
    // visible here so what was excluded can still be counted.
    await seedRun("COMPLETE", [
      nvda(),
      nvda({ tokenAddress: "0xnull", ticker: null, assetType: null }),
    ]);
    const res = await appPool.query("SELECT 1 FROM rwa.universe_current");
    expect(res.rowCount).toBe(2);
  });
});

describe("rwa.underlying_current (migration 010)", () => {
  it("aggregates every platform for one ticker into a single row", async () => {
    await seedRun("COMPLETE", [
      nvda({ platformId: "ondo", tokenAddress: "0xaaa", marketStatus: "regular" }),
      nvda({ platformId: "bstock", tokenAddress: "0xbbb", marketStatus: "closed" }),
    ]);
    const res = await appPool.query<{
      underlying_ticker: string;
      representation_count: string;
      platform_ids: string[];
      market_statuses: string[];
      any_market_open: boolean;
    }>("SELECT * FROM rwa.underlying_current");
    expect(res.rowCount).toBe(1);
    const row = res.rows[0];
    expect(row?.underlying_ticker).toBe("NVDA");
    expect(Number(row?.representation_count)).toBe(2);
    // Deterministic order, so the drawer and the list are stable between loads.
    expect(row?.platform_ids).toEqual(["bstock", "ondo"]);
    expect([...(row?.market_statuses ?? [])].sort()).toEqual(["closed", "regular"]);
    expect(row?.any_market_open).toBe(true);
  });

  it("reports any_market_open false when NO platform is in a regular session", async () => {
    await seedRun("COMPLETE", [
      nvda({ marketStatus: "closed" }),
      nvda({ platformId: "bstock", tokenAddress: "0xbbb", marketStatus: "pre_market" }),
    ]);
    const res = await appPool.query<{ any_market_open: boolean }>(
      "SELECT any_market_open FROM rwa.underlying_current",
    );
    expect(res.rows[0]?.any_market_open).toBe(false);
  });

  it("EXCLUDES a representation with a null ticker or null asset type (DEC-020)", async () => {
    await seedRun("COMPLETE", [
      nvda(),
      nvda({ tokenAddress: "0xa1", ticker: null }),
      nvda({ tokenAddress: "0xa2", ticker: "ZZZZ", assetType: null }),
    ]);
    const res = await appPool.query<{ underlying_ticker: string }>(
      "SELECT underlying_ticker FROM rwa.underlying_current ORDER BY underlying_ticker",
    );
    expect(res.rows.map((r) => r.underlying_ticker)).toEqual(["NVDA"]);
  });

  it("keeps a null market status out of the status list rather than listing a blank", async () => {
    await seedRun("COMPLETE", [nvda({ marketStatus: null })]);
    const res = await appPool.query<{
      market_statuses: string[] | null;
      any_market_open: boolean | null;
    }>("SELECT market_statuses, any_market_open FROM rwa.underlying_current");
    expect(res.rows[0]?.market_statuses).toBeNull();
    expect(res.rows[0]?.any_market_open).not.toBe(true);
  });

  it("is deterministic when platforms disagree about the company name", async () => {
    await seedRun("COMPLETE", [
      nvda({ fullName: "NVIDIA Corporation" }),
      nvda({ platformId: "bstock", tokenAddress: "0xbbb", fullName: "Nvidia Corp" }),
    ]);
    const first = await appPool.query<{ underlying_full_name: string }>(
      "SELECT underlying_full_name FROM rwa.underlying_current",
    );
    const second = await appPool.query<{ underlying_full_name: string }>(
      "SELECT underlying_full_name FROM rwa.underlying_current",
    );
    // WHICH name wins is min() under the database's collation, so asserting a
    // particular one would be asserting the collation. What the view promises
    // is that the same name comes back every time, so the page does not change
    // its company name between loads.
    expect(["NVIDIA Corporation", "Nvidia Corp"]).toContain(first.rows[0]?.underlying_full_name);
    expect(second.rows[0]?.underlying_full_name).toBe(first.rows[0]?.underlying_full_name);
  });
});

describe("the views grant READ only", () => {
  it("orchard_app can SELECT every view", async () => {
    for (const view of [
      "rwa.latest_complete_snapshot_run",
      "rwa.universe_current",
      "rwa.underlying_current",
    ]) {
      await expect(appPool.query(`SELECT 1 FROM ${view} LIMIT 1`)).resolves.toBeDefined();
    }
  });

  it("orchard_app cannot write THROUGH a view into the append-only tables", async () => {
    // A simple updatable view would otherwise be a side door around the
    // append-only rules migration 006 put on rwa.*.
    await expect(
      appPool.query("UPDATE rwa.universe_current SET market_status = 'regular'"),
    ).rejects.toThrow();
    await expect(appPool.query("DELETE FROM rwa.universe_current")).rejects.toThrow();
  });

  it("not even the owning role can DELETE through a view", async () => {
    await expect(migratorPool.query("DELETE FROM rwa.universe_current")).rejects.toThrow();
  });
});
