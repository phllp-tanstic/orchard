-- Reassigns ownership back to whichever role runs this down migration, then
-- drops orchard_migrator - but only when it's safe to. Whether current_user
-- happens to be named "orchard_migrator" is NOT a reliable signal here: in
-- an environment where POSTGRES_USER=orchard_migrator (dev today), that
-- name belongs to the Postgres bootstrap superuser itself (created by the
-- official image's own init, not by this migration), and Postgres refuses
-- to ever drop that role ("required by the database system") regardless of
-- which session asks. The reliable signal is rolsuper: the up migration
-- only ever creates orchard_migrator as NOLOGIN/non-superuser, so a
-- superuser named orchard_migrator must predate this migration and is left
-- in place; a non-superuser one was created here and is safe to drop.

ALTER TABLE rwa.token_snapshot OWNER TO CURRENT_USER;
ALTER TABLE rwa.platform_snapshot OWNER TO CURRENT_USER;
ALTER TABLE evidence.provider_call OWNER TO CURRENT_USER;
ALTER VIEW evidence.probe_run_current OWNER TO CURRENT_USER;
ALTER TABLE evidence.probe_run_event OWNER TO CURRENT_USER;
ALTER TABLE evidence.probe_run OWNER TO CURRENT_USER;

ALTER FUNCTION evidence.reject_event_after_terminal() OWNER TO CURRENT_USER;
ALTER FUNCTION evidence.reject_mutation() OWNER TO CURRENT_USER;

ALTER SCHEMA rwa OWNER TO CURRENT_USER;
ALTER SCHEMA evidence OWNER TO CURRENT_USER;

-- Undo the up migration's membership grant first - Postgres refuses to drop
-- a role that another role is still a member of.
DO $$
BEGIN
  IF current_user <> 'orchard_migrator' THEN
    EXECUTE format('REVOKE orchard_migrator FROM %I', current_user);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'orchard_migrator' AND NOT rolsuper
  ) THEN
    DROP ROLE orchard_migrator;
  END IF;
END
$$;
