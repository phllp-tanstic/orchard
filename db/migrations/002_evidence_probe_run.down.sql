DROP VIEW IF EXISTS evidence.probe_run_current;

DROP TRIGGER IF EXISTS probe_run_event_no_post_terminal ON evidence.probe_run_event;
DROP FUNCTION IF EXISTS evidence.reject_event_after_terminal();

DROP TRIGGER IF EXISTS probe_run_event_no_truncate ON evidence.probe_run_event;
DROP TRIGGER IF EXISTS probe_run_event_no_delete ON evidence.probe_run_event;
DROP TRIGGER IF EXISTS probe_run_event_no_update ON evidence.probe_run_event;
DROP TABLE IF EXISTS evidence.probe_run_event;

DROP TRIGGER IF EXISTS probe_run_no_truncate ON evidence.probe_run;
DROP TRIGGER IF EXISTS probe_run_no_delete ON evidence.probe_run;
DROP TRIGGER IF EXISTS probe_run_no_update ON evidence.probe_run;
DROP TABLE IF EXISTS evidence.probe_run;
