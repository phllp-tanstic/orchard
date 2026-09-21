CREATE TABLE evidence.probe_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETE', 'INCOMPLETE', 'FAILED')),
  git_sha text NOT NULL,
  client_version text NOT NULL,
  incomplete_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE evidence.probe_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY probe_run_app_select ON evidence.probe_run FOR SELECT TO orchard_app USING (true);
CREATE POLICY probe_run_app_insert ON evidence.probe_run FOR INSERT TO orchard_app WITH CHECK (true);

GRANT SELECT, INSERT ON evidence.probe_run TO orchard_app;

CREATE TRIGGER probe_run_no_update
  BEFORE UPDATE ON evidence.probe_run
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER probe_run_no_delete
  BEFORE DELETE ON evidence.probe_run
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
