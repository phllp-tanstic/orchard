-- Hardening set (DEC-013): rwa.*_snapshot are evidence-adjacent tables and
-- should be append-only like the rest of evidence.*, reusing the same
-- evidence.reject_mutation() trigger function rather than duplicating it.
-- Also, binanceChainId is documented as a string by the RWA data API (see
-- packages/rwa's zod schemas, all binanceChainId: z.string()); token_snapshot
-- stored it as integer, which cannot hold a non-numeric chain id such as
-- Solana's "CT_501". Widen it to text to match the provider's actual type.

CREATE TRIGGER platform_snapshot_no_update
  BEFORE UPDATE ON rwa.platform_snapshot
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER platform_snapshot_no_delete
  BEFORE DELETE ON rwa.platform_snapshot
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER platform_snapshot_no_truncate
  BEFORE TRUNCATE ON rwa.platform_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER token_snapshot_no_update
  BEFORE UPDATE ON rwa.token_snapshot
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER token_snapshot_no_delete
  BEFORE DELETE ON rwa.token_snapshot
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER token_snapshot_no_truncate
  BEFORE TRUNCATE ON rwa.token_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();

ALTER TABLE rwa.token_snapshot
  ALTER COLUMN binance_chain_id TYPE text USING binance_chain_id::text;
