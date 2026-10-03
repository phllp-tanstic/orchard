import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool, QueryResult } from "pg";
import { resetServerEnvForTests } from "./env";
import {
  findUnderlying,
  representationsOf,
  sampleUnderlyings,
  searchUnderlyings,
  snapshotMeta,
} from "./universe";

/**
 * The snapshot repository (F003 T3), tested at the pg boundary.
 *
 * A recording fake pool captures the SQL and the parameters so the ORDER of
 * the search ranking, the parameterisation (never string interpolation) and
 * the row mapping are all asserted without a database. The views themselves
 * are covered by the integration test against real Postgres; what is pinned
 * here is what this module does with the rows it gets back.
 */

interface Recorder {
  pool: Pool;
  sql: string[];
  params: unknown[][];
}

function fakePool(rowsFor: (sql: string) => unknown[]): Recorder {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const pool = {
    query: async (text: string, values?: unknown[]) => {
      sql.push(text);
      params.push(values ?? []);
      return { rows: rowsFor(text), rowCount: rowsFor(text).length } as unknown as QueryResult;
    },
  } as unknown as Pool;
  return { pool, sql, params };
}

const REQUIRED: NodeJS.ProcessEnv = {
  BINANCE_WEB3_API_KEY: "(test placeholder, not a key)",
  BINANCE_WEB3_API_SECRET: "(test placeholder, not a secret)",
  BINANCE_WEB3_BASE_URL: "https://web3.binance.com/test",
  TARGET_BINANCE_CHAIN_ID: "56",
  ORCHARD_APP_DATABASE_URL: "postgres://orchard_app:x@127.0.0.1:5432/orchard_test",
  EVIDENCE_REDACTION_SALT: "(test placeholder, not a salt)",
  NODE_ENV: "test",
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  process.env = { ...REQUIRED };
  resetServerEnvForTests();
});

afterEach(() => {
  process.env = saved;
  resetServerEnvForTests();
});

const UNDERLYING_ROW = {
  underlying_ticker: "NVDA",
  underlying_full_name: "NVIDIA Corporation",
  asset_type: 1,
  representation_count: "2",
  platform_ids: ["bstock", "ondo"],
  market_statuses: ["regular", "closed"],
  any_market_open: true,
};

describe("snapshotMeta", () => {
  it("reads the latest COMPLETE run view, never probe_run directly", () => {
    // Reading probe_run directly would let a FAILED or still-RUNNING snapshot
    // become the universe. The rule lives in the view (migration 010).
    const recorder = fakePool(() => [
      {
        probe_run_id: "run-1",
        snapshot_at: "2026-10-02T10:00:00.000Z",
        age_seconds: "600",
        underlying_count: "445",
        representation_count: "485",
      },
    ]);
    return snapshotMeta(recorder.pool).then((meta) => {
      expect(recorder.sql[0]).toContain("rwa.latest_complete_snapshot_run");
      expect(recorder.sql[0]).not.toMatch(/FROM evidence\.probe_run/);
      expect(meta).toEqual({
        snapshotAt: "2026-10-02T10:00:00.000Z",
        probeRunId: "run-1",
        ageSeconds: 600,
        stale: false,
        maxAgeSeconds: 21600,
        underlyingCount: 445,
        representationCount: 485,
      });
    });
  });

  it("marks a snapshot older than the max age as stale", async () => {
    const recorder = fakePool(() => [
      {
        probe_run_id: "run-1",
        snapshot_at: "2026-10-01T10:00:00.000Z",
        age_seconds: "21601",
        underlying_count: "445",
        representation_count: "485",
      },
    ]);
    expect((await snapshotMeta(recorder.pool)).stale).toBe(true);
  });

  it("treats exactly the max age as still fresh", async () => {
    const recorder = fakePool(() => [
      {
        probe_run_id: "run-1",
        snapshot_at: "2026-10-01T10:00:00.000Z",
        age_seconds: "21600",
        underlying_count: "1",
        representation_count: "1",
      },
    ]);
    expect((await snapshotMeta(recorder.pool)).stale).toBe(false);
  });

  it("fails CLOSED when there is no snapshot at all", async () => {
    // An empty universe must read as "no snapshot", not as "no companies".
    const recorder = fakePool(() => []);
    const meta = await snapshotMeta(recorder.pool);
    expect(meta.snapshotAt).toBeNull();
    expect(meta.probeRunId).toBeNull();
    expect(meta.stale).toBe(true);
    expect(meta.underlyingCount).toBe(0);
  });

  it("fails CLOSED when the age cannot be computed", async () => {
    const recorder = fakePool(() => [
      {
        probe_run_id: "run-1",
        snapshot_at: "2026-10-02T10:00:00.000Z",
        age_seconds: null,
        underlying_count: "1",
        representation_count: "1",
      },
    ]);
    const meta = await snapshotMeta(recorder.pool);
    expect(meta.ageSeconds).toBeNull();
    expect(meta.stale).toBe(true);
  });

  it("honours a configured max age", async () => {
    process.env["WEB_SNAPSHOT_MAX_AGE_SECONDS"] = "300";
    resetServerEnvForTests();
    const recorder = fakePool(() => [
      {
        probe_run_id: "run-1",
        snapshot_at: "2026-10-02T10:00:00.000Z",
        age_seconds: "301",
        underlying_count: "1",
        representation_count: "1",
      },
    ]);
    const meta = await snapshotMeta(recorder.pool);
    expect(meta.maxAgeSeconds).toBe(300);
    expect(meta.stale).toBe(true);
  });
});

describe("searchUnderlyings", () => {
  it("ranks an EXACT ticker first, then a ticker prefix, then a name match", async () => {
    const recorder = fakePool(() => [UNDERLYING_ROW]);
    await searchUnderlyings(recorder.pool, "nvda", 20);
    const sql = recorder.sql[0] ?? "";
    const exact = sql.indexOf("lower(underlying_ticker) = $1");
    const prefix = sql.indexOf("lower(underlying_ticker) LIKE $1 || '%') DESC");
    expect(exact).toBeGreaterThan(-1);
    expect(prefix).toBeGreaterThan(exact);
    expect(sql).toContain("underlying_full_name");
  });

  it("parameterises the needle instead of interpolating it", async () => {
    const recorder = fakePool(() => []);
    await searchUnderlyings(recorder.pool, "NV' OR 1=1 --", 20);
    expect(recorder.sql[0]).not.toContain("OR 1=1");
    expect(recorder.params[0]).toEqual(["nv' or 1=1 --", 20]);
  });

  it("lower-cases the needle so matching is case-insensitive", async () => {
    const recorder = fakePool(() => []);
    await searchUnderlyings(recorder.pool, "  NvDa  ", 5);
    expect(recorder.params[0]).toEqual(["nvda", 5]);
  });

  it("returns nothing for a blank query WITHOUT touching the database", async () => {
    const recorder = fakePool(() => [UNDERLYING_ROW]);
    expect(await searchUnderlyings(recorder.pool, "   ", 20)).toEqual([]);
    expect(recorder.sql).toEqual([]);
  });

  it("labels the asset type rather than exposing a raw number (DEC-005)", async () => {
    const recorder = fakePool(() => [
      UNDERLYING_ROW,
      { ...UNDERLYING_ROW, asset_type: 2 },
      { ...UNDERLYING_ROW, asset_type: 3 },
    ]);
    const results = await searchUnderlyings(recorder.pool, "nvda", 20);
    // 1/2/3 are the provider's codes, mapped by @orchard/rwa. An ETF must
    // never be reported as a stock (DEC-005), so the mapping is pinned here.
    expect(results.map((r) => r.assetTypeLabel)).toEqual(["Stock", "Pre-IPO", "ETF"]);
  });

  it("DROPS a row whose asset type cannot be identified (DEC-020)", async () => {
    // Labelling an untyped row anyway is exactly the guess DEC-020 forbids.
    const recorder = fakePool(() => [
      UNDERLYING_ROW,
      { ...UNDERLYING_ROW, underlying_ticker: "ZZZZ", asset_type: null },
      { ...UNDERLYING_ROW, underlying_ticker: "YYYY", asset_type: 99 },
    ]);
    const results = await searchUnderlyings(recorder.pool, "z", 20);
    expect(results.map((r) => r.ticker)).toEqual(["NVDA"]);
  });

  it("falls back to the ticker when no company name is stored", async () => {
    const recorder = fakePool(() => [{ ...UNDERLYING_ROW, underlying_full_name: null }]);
    expect((await searchUnderlyings(recorder.pool, "nvda", 20))[0]?.companyName).toBe("NVDA");
  });

  it("treats a null market flag as NOT open", async () => {
    const recorder = fakePool(() => [{ ...UNDERLYING_ROW, any_market_open: null }]);
    expect((await searchUnderlyings(recorder.pool, "nvda", 20))[0]?.anyMarketOpen).toBe(false);
  });

  it("never returns a null array where the UI expects a list", async () => {
    const recorder = fakePool(() => [
      { ...UNDERLYING_ROW, platform_ids: null, market_statuses: null },
    ]);
    const result = (await searchUnderlyings(recorder.pool, "nvda", 20))[0];
    expect(result?.platformIds).toEqual([]);
    expect(result?.marketStatuses).toEqual([]);
  });

  it("passes the limit through to the query", async () => {
    const recorder = fakePool(() => []);
    await searchUnderlyings(recorder.pool, "a", 7);
    expect(recorder.params[0]?.[1]).toBe(7);
  });
});

describe("findUnderlying", () => {
  it("matches case-insensitively and maps the row", async () => {
    const recorder = fakePool(() => [UNDERLYING_ROW]);
    const found = await findUnderlying(recorder.pool, "nvda");
    expect(recorder.sql[0]).toContain("lower(underlying_ticker) = lower($1)");
    expect(recorder.params[0]).toEqual(["nvda"]);
    expect(found?.ticker).toBe("NVDA");
    expect(found?.representationCount).toBe(2);
  });

  it("returns undefined for an unknown ticker rather than an empty shell", async () => {
    const recorder = fakePool(() => []);
    expect(await findUnderlying(recorder.pool, "ZZZZ")).toBeUndefined();
  });
});

describe("representationsOf", () => {
  const ROW = {
    platform_id: "ondo",
    token_address: "0xaaa",
    binance_chain_id: "56",
    market_status: "regular",
    token_to_share_ratio_raw: "1",
    token_symbol: "NVDAon",
    token_decimals: "18",
  };

  it("carries the stored symbol, ratio and decimals through verbatim", async () => {
    const recorder = fakePool(() => [
      { ...ROW, token_to_share_ratio_raw: "0.0001", token_decimals: "6" },
    ]);
    const [rep] = await representationsOf(recorder.pool, "nvda");
    expect(rep?.tokenToShareRatio).toBe("0.0001");
    expect(rep?.tokenDecimals).toBe("6");
    expect(rep?.tokenSymbol).toBe("NVDAon");
  });

  it("leaves MISSING decimals empty so the engine rejects the candidate", async () => {
    // Decimals scale money. Defaulting a missing value to 18 would produce a
    // confidently wrong share count; an empty string makes the engine refuse.
    const recorder = fakePool(() => [{ ...ROW, token_decimals: null }]);
    const [rep] = await representationsOf(recorder.pool, "nvda");
    expect(rep?.tokenDecimals).toBe("");
    expect(rep?.tokenDecimals).not.toBe("18");
  });

  it("falls back to the ticker for a missing SYMBOL, which is presentation only", async () => {
    const recorder = fakePool(() => [{ ...ROW, token_symbol: null }]);
    expect((await representationsOf(recorder.pool, "nvda"))[0]?.tokenSymbol).toBe("NVDA");
  });

  it("orders deterministically, so the drawer is stable between loads", async () => {
    const recorder = fakePool(() => []);
    await representationsOf(recorder.pool, "NVDA");
    expect(recorder.sql[0]).toContain("ORDER BY platform_id, token_address");
  });

  it("returns every platform's representation, not just one", async () => {
    const recorder = fakePool(() => [
      ROW,
      { ...ROW, platform_id: "bstock", token_address: "0xbbb" },
    ]);
    const reps = await representationsOf(recorder.pool, "NVDA");
    expect(reps.map((r) => r.platformId)).toEqual(["ondo", "bstock"]);
  });
});

describe("sampleUnderlyings", () => {
  it("is deterministic: most representations first, then ticker", async () => {
    const recorder = fakePool(() => [UNDERLYING_ROW]);
    await sampleUnderlyings(recorder.pool, 12);
    expect(recorder.sql[0]).toContain("ORDER BY representation_count DESC, underlying_ticker ASC");
    expect(recorder.sql[0]).not.toMatch(/random\(\)/i);
    expect(recorder.params[0]).toEqual([12]);
  });
});
