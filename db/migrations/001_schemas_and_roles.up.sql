-- Schemas: evidence and rwa. Nothing in public (Supabase auto-exposes public
-- through its generated API). orchard_app is a limited, privilege-scoped
-- role for the application; it is never granted anything on public and its
-- login password is set out-of-band from env (see db/migrate.ts), never in
-- a committed migration file.

CREATE SCHEMA IF NOT EXISTS evidence;
CREATE SCHEMA IF NOT EXISTS rwa;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orchard_app') THEN
    CREATE ROLE orchard_app LOGIN;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM orchard_app;
GRANT USAGE ON SCHEMA evidence TO orchard_app;
GRANT USAGE ON SCHEMA rwa TO orchard_app;

-- Shared by every evidence.* table's append-only triggers (created per table
-- in their own migrations). Owning the function here keeps it independent of
-- any single table's up/down lifecycle.
CREATE OR REPLACE FUNCTION evidence.reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'evidence tables are append-only: % is not permitted on %.%',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
