import "server-only";
import type { Pool } from "pg";
import { ASSET_TYPE_LABEL, type AssetType } from "@orchard/rwa";
import { serverEnv } from "./env";

/**
 * Universe snapshot repository (F003 T3).
 *
 * Search reads the STORED snapshot of the latest COMPLETE run, never a live
 * provider call per request. The "latest COMPLETE run" rule lives in the
 * database view `rwa.latest_complete_snapshot_run` (migration 010), so the app
 * cannot accidentally read a FAILED or still-RUNNING run.
 *
 * The snapshot carries every field search needs - ticker, company name, asset
 * type, market status, platform and contract - confirmed against migrations
 * 004 and 006 before this was built.
 */

export interface SnapshotMeta {
  /** null when no COMPLETE run with token rows exists yet. */
  snapshotAt: string | null;
  probeRunId: string | null;
  ageSeconds: number | null;
  /** True when the snapshot is older than WEB_SNAPSHOT_MAX_AGE_SECONDS. */
  stale: boolean;
  maxAgeSeconds: number;
  underlyingCount: number;
  representationCount: number;
}

export interface UnderlyingSummary {
  ticker: string;
  companyName: string;
  assetType: AssetType;
  /** "Stock" or "ETF" - never a raw number in the UI (DEC-005). */
  assetTypeLabel: string;
  /** How many supported representations exist for this underlying. */
  representationCount: number;
  /** Platform ids. Shown only in the "Why this route?" drawer (F003 T4). */
  platformIds: string[];
  marketStatuses: string[];
  /** True when at least one representation reports a regular trading session. */
  anyMarketOpen: boolean;
}

export interface RepresentationSummary {
  platformId: string;
  tokenContractAddress: string;
  binanceChainId: string;
  marketStatus: string | null;
  tokenToShareRatio: string;
  /** From the stored provider object, never guessed. */
  tokenSymbol: string;
  /** Token decimals as the provider reported them, as a string. */
  tokenDecimals: string;
}

function toAssetType(value: unknown): AssetType | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

interface UnderlyingRow {
  underlying_ticker: string;
  underlying_full_name: string | null;
  asset_type: number | null;
  representation_count: string;
  platform_ids: string[] | null;
  market_statuses: string[] | null;
  any_market_open: boolean | null;
}

function mapUnderlying(row: UnderlyingRow): UnderlyingSummary | undefined {
  const assetType = toAssetType(row.asset_type);
  // A row that cannot be typed cannot be labelled, and labelling it anyway is
  // exactly the kind of guess DEC-020 forbids. The view already excludes these;
  // this is belt and braces.
  if (assetType === undefined) return undefined;
  return {
    ticker: row.underlying_ticker,
    companyName: row.underlying_full_name ?? row.underlying_ticker,
    assetType,
    assetTypeLabel: ASSET_TYPE_LABEL[assetType],
    representationCount: Number(row.representation_count),
    platformIds: row.platform_ids ?? [],
    marketStatuses: row.market_statuses ?? [],
    anyMarketOpen: row.any_market_open === true,
  };
}

export async function snapshotMeta(pool: Pool): Promise<SnapshotMeta> {
  const maxAgeSeconds = serverEnv().WEB_SNAPSHOT_MAX_AGE_SECONDS;
  const res = await pool.query<{
    probe_run_id: string | null;
    snapshot_at: string | null;
    age_seconds: string | null;
    underlying_count: string;
    representation_count: string;
  }>(
    `SELECT run.probe_run_id,
            run.finished_at AS snapshot_at,
            EXTRACT(EPOCH FROM (now() - run.finished_at))::bigint AS age_seconds,
            (SELECT count(*) FROM rwa.underlying_current) AS underlying_count,
            (SELECT count(*) FROM rwa.universe_current) AS representation_count
       FROM rwa.latest_complete_snapshot_run run`,
  );
  const row = res.rows[0];
  if (row === undefined || row.snapshot_at === null) {
    return {
      snapshotAt: null,
      probeRunId: null,
      ageSeconds: null,
      // No snapshot at all is treated as stale: the UI must say so rather than
      // render an empty universe as if it were a complete one.
      stale: true,
      maxAgeSeconds,
      underlyingCount: 0,
      representationCount: 0,
    };
  }
  const ageSeconds = row.age_seconds === null ? null : Number(row.age_seconds);
  return {
    snapshotAt: new Date(row.snapshot_at).toISOString(),
    probeRunId: row.probe_run_id,
    ageSeconds,
    stale: ageSeconds === null ? true : ageSeconds > maxAgeSeconds,
    maxAgeSeconds,
    underlyingCount: Number(row.underlying_count),
    representationCount: Number(row.representation_count),
  };
}

/**
 * Search by ticker and by company name, case-insensitive. Ticker matches rank
 * ahead of name matches, and an exact ticker ranks first, because someone
 * typing "NVDA" means the ticker.
 */
export async function searchUnderlyings(
  pool: Pool,
  query: string,
  limit: number,
): Promise<UnderlyingSummary[]> {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const needle = trimmed.toLowerCase();
  const res = await pool.query<UnderlyingRow>(
    `SELECT underlying_ticker, underlying_full_name, asset_type,
            representation_count, platform_ids, market_statuses, any_market_open
       FROM rwa.underlying_current
      WHERE lower(underlying_ticker) LIKE $1 || '%'
         OR lower(coalesce(underlying_full_name, '')) LIKE '%' || $1 || '%'
      ORDER BY (lower(underlying_ticker) = $1) DESC,
               (lower(underlying_ticker) LIKE $1 || '%') DESC,
               underlying_ticker ASC
      LIMIT $2`,
    [needle, limit],
  );
  return res.rows.map(mapUnderlying).filter((u): u is UnderlyingSummary => u !== undefined);
}

export async function findUnderlying(
  pool: Pool,
  ticker: string,
): Promise<UnderlyingSummary | undefined> {
  const res = await pool.query<UnderlyingRow>(
    `SELECT underlying_ticker, underlying_full_name, asset_type,
            representation_count, platform_ids, market_statuses, any_market_open
       FROM rwa.underlying_current
      WHERE lower(underlying_ticker) = lower($1)`,
    [ticker],
  );
  const row = res.rows[0];
  return row === undefined ? undefined : mapUnderlying(row);
}

/** Every stored representation of one underlying, for the engine and the drawer. */
export async function representationsOf(
  pool: Pool,
  ticker: string,
): Promise<RepresentationSummary[]> {
  const res = await pool.query<{
    platform_id: string;
    token_address: string;
    binance_chain_id: string;
    market_status: string | null;
    token_to_share_ratio_raw: string;
    token_symbol: string | null;
    token_decimals: string | null;
  }>(
    `SELECT platform_id, token_address, binance_chain_id, market_status,
            token_to_share_ratio_raw, token_symbol, token_decimals
       FROM rwa.universe_current
      WHERE lower(underlying_ticker) = lower($1)
      ORDER BY platform_id, token_address`,
    [ticker],
  );
  return res.rows.map((r) => ({
    platformId: r.platform_id,
    tokenContractAddress: r.token_address,
    binanceChainId: r.binance_chain_id,
    marketStatus: r.market_status,
    tokenToShareRatio: r.token_to_share_ratio_raw,
    // A symbol is presentation only, so falling back to the ticker is safe.
    // Decimals are NOT: they scale money. A missing value is left empty so the
    // engine rejects it rather than silently assuming 18.
    tokenSymbol: r.token_symbol ?? ticker.toUpperCase(),
    tokenDecimals: r.token_decimals ?? "",
  }));
}

/** A small sample for the explore page. Deterministic, so the page is stable. */
export async function sampleUnderlyings(pool: Pool, limit: number): Promise<UnderlyingSummary[]> {
  const res = await pool.query<UnderlyingRow>(
    `SELECT underlying_ticker, underlying_full_name, asset_type,
            representation_count, platform_ids, market_statuses, any_market_open
       FROM rwa.underlying_current
      ORDER BY representation_count DESC, underlying_ticker ASC
      LIMIT $1`,
    [limit],
  );
  return res.rows.map(mapUnderlying).filter((u): u is UnderlyingSummary => u !== undefined);
}
