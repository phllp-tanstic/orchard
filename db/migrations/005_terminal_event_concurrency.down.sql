DROP INDEX IF EXISTS evidence.probe_run_event_one_terminal_per_run;

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

CREATE OR REPLACE VIEW evidence.probe_run_current
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
