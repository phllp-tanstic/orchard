import type { Pool, PoolClient } from "pg";

/**
 * Writers for the rwa.* snapshot tables (F003 T3).
 *
 * These tables already existed (migrations 004 and 006) with every field the
 * app's search needs, but nothing wrote to them: before this, the only
 * references in the codebase were an integration test that inserts inside a
 * rolled-back transaction. `pnpm universe:refresh` is the writer.
 *
 * Append-only, like the rest of evidence.*: INSERT only, enforced by the
 * triggers migration 006 installed. Every provider numeric is stored twice -
 * the exact string as received and a NUMERIC parse - so the raw bytes stay
 * auditable and a query can still sort and compare.
 */

/** Shape the writer needs from a parsed /rwa/platforms row. */
export interface PlatformSnapshotRow {
  platformId: string;
  platformName?: string | null | undefined;
  /** The full provider object, so unknown fields survive rather than being dropped. */
  raw: unknown;
}

/**
 * Shape the writer needs from a parsed /rwa/tokens row.
 *
 * `referencePrice` here is the `/rwa/tokens` field, which is a PER-TOKEN price
 * (F002 Amendment A1). It is stored for completeness and must never be
 * presented as a per-share price; the per-share benchmark comes from
 * `/rwa/price` at preview time.
 */
export interface TokenSnapshotRow {
  platformId: string;
  tokenContractAddress: string;
  binanceChainId: string;
  underlyingTicker?: string | null | undefined;
  underlyingName?: string | null | undefined;
  assetType?: number | null | undefined;
  marketStatus?: string | null | undefined;
  tokenToShareRatio: string;
  tokenPrice?: string | null | undefined;
  /** Per-TOKEN price from /rwa/tokens. Not per-share. */
  referencePrice?: string | null | undefined;
  tokenPriceUpdatedAt?: Date | null | undefined;
  raw: unknown;
}

/** A plain decimal the NUMERIC columns can accept. Anything else is stored as NULL. */
const PLAIN_DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * Only the raw string column is guaranteed; the NUMERIC parse is best effort.
 * A non-numeric provider value is recorded verbatim in the `_raw` column with
 * NULL alongside it, rather than failing the write or coercing to zero.
 */
function numericOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return PLAIN_DECIMAL.test(value) ? value : null;
}

export interface SnapshotWriteCounts {
  platforms: number;
  tokens: number;
}

export async function insertPlatformSnapshots(
  client: Pool | PoolClient,
  args: { probeRunId: string; providerCallId: string; rows: readonly PlatformSnapshotRow[] },
): Promise<number> {
  for (const row of args.rows) {
    await client.query(
      `INSERT INTO rwa.platform_snapshot
         (probe_run_id, provider_call_id, platform_id, platform_name, raw)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        args.probeRunId,
        args.providerCallId,
        row.platformId,
        row.platformName ?? null,
        JSON.stringify(row.raw),
      ],
    );
  }
  return args.rows.length;
}

export async function insertTokenSnapshots(
  client: Pool | PoolClient,
  args: { probeRunId: string; providerCallId: string; rows: readonly TokenSnapshotRow[] },
): Promise<number> {
  for (const row of args.rows) {
    await client.query(
      `INSERT INTO rwa.token_snapshot
         (probe_run_id, provider_call_id, platform_id, token_address, binance_chain_id,
          underlying_ticker, underlying_full_name, asset_type, market_status,
          token_to_share_ratio_raw, token_to_share_ratio,
          token_price_raw, token_price, reference_price_raw, reference_price,
          token_price_updated_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        args.probeRunId,
        args.providerCallId,
        row.platformId,
        row.tokenContractAddress,
        row.binanceChainId,
        row.underlyingTicker ?? null,
        row.underlyingName ?? null,
        row.assetType ?? null,
        row.marketStatus ?? null,
        row.tokenToShareRatio,
        // token_to_share_ratio is NOT NULL, so an unparseable ratio must still
        // produce a number. 0 is the sentinel the engine already treats as
        // INVALID_RATIO, so it can never be mistaken for a usable ratio.
        numericOrNull(row.tokenToShareRatio) ?? "0",
        row.tokenPrice ?? null,
        numericOrNull(row.tokenPrice),
        row.referencePrice ?? null,
        numericOrNull(row.referencePrice),
        row.tokenPriceUpdatedAt ?? null,
        JSON.stringify(row.raw),
      ],
    );
  }
  return args.rows.length;
}

/**
 * The sink the F001-A pipeline calls as it parses each response, so the
 * snapshot is written from the SAME parsed data the probe already produced
 * rather than from a second pass over the provider (F003 T3: reuse, do not
 * duplicate).
 */
export interface SnapshotSink {
  platforms(args: { providerCallId: string; rows: readonly PlatformSnapshotRow[] }): Promise<void>;
  tokens(args: { providerCallId: string; rows: readonly TokenSnapshotRow[] }): Promise<void>;
}

export function createSnapshotSink(
  pool: Pool,
  probeRunId: string,
  counts: SnapshotWriteCounts = { platforms: 0, tokens: 0 },
): SnapshotSink & { counts: SnapshotWriteCounts } {
  return {
    counts,
    async platforms({ providerCallId, rows }): Promise<void> {
      counts.platforms += await insertPlatformSnapshots(pool, {
        probeRunId,
        providerCallId,
        rows,
      });
    },
    async tokens({ providerCallId, rows }): Promise<void> {
      counts.tokens += await insertTokenSnapshots(pool, { probeRunId, providerCallId, rows });
    },
  };
}
