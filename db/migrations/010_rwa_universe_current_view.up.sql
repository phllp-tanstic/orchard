-- F003 T3: a READ-ONLY VIEW over the latest COMPLETE snapshot run, plus
-- supporting indexes. No new data table: T3 permits a migration only for a
-- read-only view or an index, and the append-only rules on rwa.* stay exactly
-- as migration 006 left them.
--
-- Why a view rather than a query in the app: "the latest COMPLETE run" is a
-- correctness rule, not a presentation choice. Putting it in one place means
-- the app cannot accidentally read a FAILED or still-RUNNING run and present
-- it as the universe.

-- The newest probe_run whose terminal event is COMPLETE and which actually
-- produced token rows. A run that completed but wrote no snapshot (for example
-- `pnpm probe:rwa`, which reports without snapshotting) must not win, or the
-- app would see an empty universe.
CREATE VIEW rwa.latest_complete_snapshot_run AS
SELECT r.probe_run_id,
       r.finished_at,
       r.git_sha,
       r.client_version
  FROM evidence.probe_run_current r
 WHERE r.status = 'COMPLETE'
   AND EXISTS (SELECT 1 FROM rwa.token_snapshot t WHERE t.probe_run_id = r.probe_run_id)
 ORDER BY r.finished_at DESC
 LIMIT 1;

-- One row per tokenized representation in that run: everything the app's
-- search and detail views need, and nothing that would let a caller mistake a
-- per-token price for a per-share price.
--
-- reference_price here is the /rwa/tokens field, which is PER TOKEN
-- (F002 Amendment A1). It is exposed under an explicit per_token name so the
-- unit travels with the column. The per-share benchmark is NOT in this view:
-- it comes from /rwa/price at preview time.
CREATE VIEW rwa.universe_current AS
SELECT t.probe_run_id,
       run.finished_at                AS snapshot_at,
       t.platform_id,
       t.token_address,
       t.binance_chain_id,
       t.underlying_ticker,
       t.underlying_full_name,
       t.asset_type,
       t.market_status,
       t.token_to_share_ratio_raw,
       t.token_to_share_ratio,
       t.token_price_raw              AS token_price_per_token_raw,
       t.reference_price_raw          AS reference_price_per_token_raw,
       -- The snapshot table has no symbol or decimals column, but `raw` keeps
       -- the whole provider object precisely so nothing is lost. Reading them
       -- from there beats hardcoding 18 decimals in the app, which would be a
       -- guess about a provider value.
       t.raw ->> 'tokenSymbol'        AS token_symbol,
       t.raw ->> 'decimals'           AS token_decimals
  FROM rwa.token_snapshot t
  JOIN rwa.latest_complete_snapshot_run run ON run.probe_run_id = t.probe_run_id;

-- One row per underlying, aggregated for search. A representation with a null
-- ticker or null asset type cannot be searched or typed (DEC-020), so those
-- are excluded HERE rather than silently dropped later - and the count of what
-- was excluded stays visible in rwa.universe_current.
CREATE VIEW rwa.underlying_current AS
SELECT u.underlying_ticker,
       u.underlying_full_name,
       u.asset_type,
       u.snapshot_at,
       u.representation_count,
       u.platform_ids,
       u.market_statuses,
       u.any_market_open
  FROM (
    SELECT t.underlying_ticker,
           -- Provider names can differ between platforms for the same ticker;
           -- take the lexicographically first so the view is deterministic.
           min(t.underlying_full_name)                       AS underlying_full_name,
           min(t.asset_type)                                 AS asset_type,
           max(t.snapshot_at)                                AS snapshot_at,
           count(*)                                          AS representation_count,
           array_agg(DISTINCT t.platform_id ORDER BY t.platform_id) AS platform_ids,
           array_agg(DISTINCT t.market_status) FILTER (WHERE t.market_status IS NOT NULL)
                                                             AS market_statuses,
           bool_or(t.market_status = 'regular')               AS any_market_open
      FROM rwa.universe_current t
     WHERE t.underlying_ticker IS NOT NULL
       AND t.asset_type IS NOT NULL
     GROUP BY t.underlying_ticker
  ) u;

-- Search is by ticker prefix and by company-name substring, both
-- case-insensitive, over the snapshot rather than per-request provider calls.
CREATE INDEX token_snapshot_ticker_lower_idx
  ON rwa.token_snapshot (lower(underlying_ticker));
CREATE INDEX token_snapshot_name_lower_idx
  ON rwa.token_snapshot (lower(underlying_full_name));
-- The view filters on probe_run_id then groups; this supports both.
CREATE INDEX token_snapshot_run_ticker_idx
  ON rwa.token_snapshot (probe_run_id, underlying_ticker);

-- DEC-014: every object in evidence/rwa is owned by orchard_migrator, not by
-- whichever role happened to run the migration. Without these three lines the
-- views end up owned by the connecting superuser, which the bootstrap
-- integration test correctly rejects.
ALTER VIEW rwa.latest_complete_snapshot_run OWNER TO orchard_migrator;
ALTER VIEW rwa.universe_current OWNER TO orchard_migrator;
ALTER VIEW rwa.underlying_current OWNER TO orchard_migrator;

GRANT SELECT ON rwa.latest_complete_snapshot_run TO orchard_app;
GRANT SELECT ON rwa.universe_current TO orchard_app;
GRANT SELECT ON rwa.underlying_current TO orchard_app;
