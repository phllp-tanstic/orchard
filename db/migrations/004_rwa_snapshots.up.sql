-- Minimum snapshot tables per docs/specs/F001A-spec.md T3/T4. Every provider
-- numeric is stored twice: the exact string as received (never modified,
-- for auditability) and a NUMERIC parse (decimal.js on the app side; never
-- a float). `raw` keeps the full response object per row so unknown/extra
-- fields are preserved, not dropped (T4 schema-drift requirement).

CREATE TABLE rwa.platform_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id uuid NOT NULL REFERENCES evidence.probe_run (id),
  provider_call_id uuid NOT NULL REFERENCES evidence.provider_call (id),
  platform_id text NOT NULL,
  platform_name text,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_snapshot_probe_run_id_idx ON rwa.platform_snapshot (probe_run_id);
CREATE INDEX platform_snapshot_platform_id_idx ON rwa.platform_snapshot (platform_id);

ALTER TABLE rwa.platform_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_snapshot_app_select ON rwa.platform_snapshot FOR SELECT TO orchard_app USING (true);
CREATE POLICY platform_snapshot_app_insert ON rwa.platform_snapshot FOR INSERT TO orchard_app WITH CHECK (true);
GRANT SELECT, INSERT ON rwa.platform_snapshot TO orchard_app;

CREATE TABLE rwa.token_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id uuid NOT NULL REFERENCES evidence.probe_run (id),
  provider_call_id uuid NOT NULL REFERENCES evidence.provider_call (id),
  platform_id text NOT NULL,
  token_address text NOT NULL,
  binance_chain_id integer NOT NULL,
  underlying_ticker text,
  underlying_full_name text,
  asset_type integer,
  market_status text,
  token_to_share_ratio_raw text NOT NULL,
  token_to_share_ratio numeric NOT NULL,
  token_price_raw text,
  token_price numeric,
  reference_price_raw text,
  reference_price numeric,
  token_price_updated_at timestamptz,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX token_snapshot_probe_run_id_idx ON rwa.token_snapshot (probe_run_id);
CREATE INDEX token_snapshot_underlying_ticker_idx ON rwa.token_snapshot (underlying_ticker);
CREATE INDEX token_snapshot_token_address_idx ON rwa.token_snapshot (token_address);

ALTER TABLE rwa.token_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY token_snapshot_app_select ON rwa.token_snapshot FOR SELECT TO orchard_app USING (true);
CREATE POLICY token_snapshot_app_insert ON rwa.token_snapshot FOR INSERT TO orchard_app WITH CHECK (true);
GRANT SELECT, INSERT ON rwa.token_snapshot TO orchard_app;
