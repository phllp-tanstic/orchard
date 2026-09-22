CREATE TABLE evidence.provider_call (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id uuid NOT NULL REFERENCES evidence.probe_run (id),
  provider text NOT NULL,
  method text NOT NULL,
  endpoint text NOT NULL,
  redacted_request jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status integer,
  provider_code text,
  latency_ms integer NOT NULL,
  rate_limit_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_sha256 text NOT NULL,
  raw_response bytea NOT NULL,
  response_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_call_probe_run_id_idx ON evidence.provider_call (probe_run_id);

ALTER TABLE evidence.provider_call ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_call_app_select ON evidence.provider_call FOR SELECT TO orchard_app USING (true);
CREATE POLICY provider_call_app_insert ON evidence.provider_call FOR INSERT TO orchard_app WITH CHECK (true);

GRANT SELECT, INSERT ON evidence.provider_call TO orchard_app;

CREATE TRIGGER provider_call_no_update
  BEFORE UPDATE ON evidence.provider_call
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER provider_call_no_delete
  BEFORE DELETE ON evidence.provider_call
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER provider_call_no_truncate
  BEFORE TRUNCATE ON evidence.provider_call
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();
