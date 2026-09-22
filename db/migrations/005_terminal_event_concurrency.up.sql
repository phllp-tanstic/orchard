-- Amendment A2 (DEC-013): make the terminal-state rule concurrency-safe.
-- The trigger-only check in 002 cannot see another transaction's uncommitted
-- terminal event, so two concurrent writers could both record a terminal
-- status for the same run. Enforce it in the database, not in trigger timing.

-- 1. At most one terminal event per run, enforced by the storage engine.
CREATE UNIQUE INDEX probe_run_event_one_terminal_per_run
  ON evidence.probe_run_event (probe_run_id)
  WHERE status IN ('COMPLETE', 'INCOMPLETE', 'FAILED');

-- 2. Serialize event inserts per run so "no event after terminal" is checked
--    against committed state. Advisory lock is transaction-scoped and needs
--    no extra privilege for orchard_app.
CREATE OR REPLACE FUNCTION evidence.reject_event_after_terminal() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.probe_run_id::text, 0));
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

-- 3. The current status can never regress: the (single) terminal event always
--    wins over non-terminal events, regardless of transaction start times.
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
  ORDER BY (e.status IN ('COMPLETE', 'INCOMPLETE', 'FAILED')) DESC, e.recorded_at DESC, e.id DESC
  LIMIT 1
) latest ON true;
