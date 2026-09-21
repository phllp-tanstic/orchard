-- DEC-014 (option 1): the spec (section 3, T3) names orchard_migrator as the
-- role that owns evidence/rwa schema objects, but no prior migration created
-- it - ownership fell out of whichever role happened to run migrations
-- (dev: POSTGRES_USER; CI: the service container's user). That's fine only
-- by coincidence today (dev's POSTGRES_USER is literally "orchard_migrator")
-- and breaks the moment the connecting role is named anything else, e.g.
-- Supabase's platform-provided admin role (DEC-002). This migration creates
-- orchard_migrator explicitly and reassigns ownership of every existing
-- evidence/rwa object to it, independent of whichever role executes this.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orchard_migrator') THEN
    CREATE ROLE orchard_migrator NOLOGIN;
  END IF;
END
$$;

-- Postgres requires membership in the target role (or superuser) to reassign
-- ownership to it. Skip the self-grant when the connecting role already IS
-- orchard_migrator (dev today) - granting a role to itself errors.
DO $$
BEGIN
  IF current_user <> 'orchard_migrator' THEN
    EXECUTE format('GRANT orchard_migrator TO %I', current_user);
  END IF;
END
$$;

ALTER SCHEMA evidence OWNER TO orchard_migrator;
ALTER SCHEMA rwa OWNER TO orchard_migrator;

ALTER FUNCTION evidence.reject_mutation() OWNER TO orchard_migrator;
ALTER FUNCTION evidence.reject_event_after_terminal() OWNER TO orchard_migrator;

ALTER TABLE evidence.probe_run OWNER TO orchard_migrator;
ALTER TABLE evidence.probe_run_event OWNER TO orchard_migrator;
ALTER VIEW evidence.probe_run_current OWNER TO orchard_migrator;
ALTER TABLE evidence.provider_call OWNER TO orchard_migrator;
ALTER TABLE rwa.platform_snapshot OWNER TO orchard_migrator;
ALTER TABLE rwa.token_snapshot OWNER TO orchard_migrator;
