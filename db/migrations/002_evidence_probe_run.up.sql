-- Amended by DEC-010 (Spec Amendment A1, docs/DECISIONS.md): probe_run is an
-- immutable header row; probe_run_event is the append-only status ledger.
-- This replaces the original mutable-status probe_run design, which
-- conflicted with the blanket append-only trigger required below.

CREATE TABLE evidence.probe_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  git_sha text NOT NULL,
  client_version text NOT NULL
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

CREATE TRIGGER probe_run_no_truncate
  BEFORE TRUNCATE ON evidence.probe_run
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();

CREATE TABLE evidence.probe_run_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id uuid NOT NULL REFERENCES evidence.probe_run (id),
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETE', 'INCOMPLETE', 'FAILED')),
  incomplete_reasons jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX probe_run_event_probe_run_id_idx ON evidence.probe_run_event (probe_run_id);

ALTER TABLE evidence.probe_run_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY probe_run_event_app_select ON evidence.probe_run_event FOR SELECT TO orchard_app USING (true);
CREATE POLICY probe_run_event_app_insert ON evidence.probe_run_event FOR INSERT TO orchard_app WITH CHECK (true);

GRANT SELECT, INSERT ON evidence.probe_run_event TO orchard_app;

CREATE TRIGGER probe_run_event_no_update
  BEFORE UPDATE ON evidence.probe_run_event
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER probe_run_event_no_delete
  BEFORE DELETE ON evidence.probe_run_event
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER probe_run_event_no_truncate
  BEFORE TRUNCATE ON evidence.probe_run_event
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();

-- No status regression, no reopening a finished run: once a probe_run has a
-- terminal event (COMPLETE/INCOMPLETE/FAILED), reject any further event for
-- that same probe_run_id, including another terminal event.
CREATE OR REPLACE FUNCTION evidence.reject_event_after_terminal() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evidence.probe_run_event
    WHERE probe_run_id = NEW.probe_run_id
      AND status IN ('COMPLETE', 'INCOMPLETE', 'FAILED')
  ) THEN
    RAISE EXCEPTION 'probe_run % already has a terminal event; cannot append status %',
      NEW.probe_run_id, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER probe_run_event_no_post_terminal
  BEFORE INSERT ON evidence.probe_run_event
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_event_after_terminal();

-- security_invoker so orchard_app's SELECT grant + RLS policies on the base
-- tables govern access through the view too, rather than the view owner's.
CREATE VIEW evidence.probe_run_current
WITH (security_invoker = true) AS
SELECT
  pr.id AS probe_run_id,
  pr.started_at,
  pr.git_sha,
  pr.client_version,
  latest.status,
  latest.incomplete_reasons,
  CASE
    WHEN latest.status IN ('COMPLETE', 'INCOMPLETE', 'FAILED') THEN latest.recorded_at
  END AS finished_at
FROM evidence.probe_run pr
JOIN LATERAL (
  SELECT e.status, e.incomplete_reasons, e.recorded_at
  FROM evidence.probe_run_event e
  WHERE e.probe_run_id = pr.id
  ORDER BY e.recorded_at DESC, e.id DESC
  LIMIT 1
) latest ON true;

GRANT SELECT ON evidence.probe_run_current TO orchard_app;
