-- Reverts binance_chain_id to integer. Fails if any stored value is
-- non-numeric (e.g. "CT_501") - by design, this is a lossy revert and is
-- only safe on a database with no such rows.
ALTER TABLE rwa.token_snapshot
  ALTER COLUMN binance_chain_id TYPE integer USING binance_chain_id::integer;

DROP TRIGGER IF EXISTS token_snapshot_no_truncate ON rwa.token_snapshot;
DROP TRIGGER IF EXISTS token_snapshot_no_delete ON rwa.token_snapshot;
DROP TRIGGER IF EXISTS token_snapshot_no_update ON rwa.token_snapshot;

DROP TRIGGER IF EXISTS platform_snapshot_no_truncate ON rwa.platform_snapshot;
DROP TRIGGER IF EXISTS platform_snapshot_no_delete ON rwa.platform_snapshot;
DROP TRIGGER IF EXISTS platform_snapshot_no_update ON rwa.platform_snapshot;
