# Decisions

Owner approvals. This file wins over every other document except live provider evidence in
the narrow sense described in `AGENTS.md`'s source-of-truth table.

Status vocabulary for decisions: `APPROVED`, `OPEN`.

## Approved

### DEC-001

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Feature 001 approved, split A (read-only universe), B (quotes and simulation,
  no signing), C (owner-driven Agentic Wallet probe). Spec `docs/specs/F001A-spec.md` covers
  A only.

### DEC-002

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** PostgreSQL from the first commit. Production and staging: Supabase (separate
  projects, created later). Development and tests: local Postgres in Docker. CI: Postgres
  service container.

### DEC-008

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** License Apache-2.0. Copyright holder: phllp-tanstic.

### DEC-009

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Repository is public from the first commit.

### DEC-010

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Spec Amendment A1 to `docs/specs/F001A-spec.md` section 3 (T3) and section 5,
  resolving the conflict between an append-only evidence trigger and a mutable `probe_run`
  status. `evidence.probe_run` becomes an immutable header (id, started_at, git_sha,
  client_version; no status column). `evidence.probe_run_event` is a new append-only table
  (id, probe_run_id, status [`RUNNING`/`COMPLETE`/`INCOMPLETE`/`FAILED`], incomplete_reasons
  jsonb nullable, recorded_at). The header and its `RUNNING` event are inserted in one
  transaction. Once a terminal event (`COMPLETE`/`INCOMPLETE`/`FAILED`) exists for a run, a
  trigger rejects any further event for that run (no status regression). A view,
  `evidence.probe_run_current`, exposes run id, latest status, reasons, and finished_at (time
  of the terminal event). The blanket evidence trigger stays with no exceptions: it rejects
  UPDATE, DELETE, and TRUNCATE (statement-level) on every evidence table, including for the
  owner role. The report generator only marks a run `COMPLETE` from a `COMPLETE` event; a run
  with no terminal event is never reported complete.

### DEC-011

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** T1-T4 of Feature 001-A may be pushed to a review branch
  (`feat/f001a-t1-t4`) for owner review. `main` is not advanced — it stays at
  `origin/main` until the owner separately approves a merge. No push to `main`
  is authorized by this decision.

### DEC-012

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** `packages/rwa`'s zod schema keeps `decimals` as `z.string()`,
  strict, per the RWA data docs' parameter table (which documents it as
  STRING), even though that same doc page's example response shows
  `"decimals": 18` as a bare number. The discrepancy is logged in
  `docs/DEVEX_CANDIDATES.md` for the owner to reproduce or discard once a
  live call is made. A number-shaped `decimals` fails schema validation
  visibly, naming the field, rather than being silently coerced.

### DEC-013

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Spec Amendment A2 to `docs/specs/F001A-spec.md` (section 11): a
  hardening set found in review, before owner sign-off on T1-T4.
  1. Migration 005 makes the terminal-event rule concurrency-safe: a partial
     unique index (one terminal event per run, enforced by the storage
     engine) plus an advisory-xact-lock-serialized trigger, replacing the
     DEC-010 trigger-only check that could race under concurrent writers.
  2. `.gitleaks.toml`'s path-based allowlist for
     `test/fixtures/(SYNTHETIC_|DOC_EXAMPLE_)*` is removed - it exempted an
     entire directory - and replaced with an exact-value allowlist for the
     one fixture secret that needs it
     (`SYNTHETIC_TEST_SECRET_0123456789`). `test/gitleaks-regression.test.ts`
     runs the pinned gitleaks 8.30.1 binary for real against throwaway temp
     directories and this repo's own history to prove it.
  3. Node moves from 20 to 24: `package.json` engines, `ci.yml`, and a new
     `.nvmrc`.
  4. `docker-compose.yml`'s Postgres port binds to `127.0.0.1` only.
  5. `db/migrate.ts down` refuses to run unless
     `ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1` is set; `ci.yml` sets it only for
     the "Migration down" step.
  6. Migration 006 makes `rwa.platform_snapshot` and `rwa.token_snapshot`
     append-only (reusing `evidence.reject_mutation()`) and widens
     `rwa.token_snapshot.binance_chain_id` from `integer` to `text` - the RWA
     data API documents `binanceChainId` as a string, and a non-EVM chain id
     such as Solana's `"CT_501"` cannot fit in an integer column.
  7. `ci.yml` adds `pnpm format:check` and `pnpm audit --audit-level=high`
     gates, and installs a pinned, sha256-verified gitleaks binary.
  8. `packages/rwa`'s `ratioAnomalyReason()` validates `tokenToShareRatio`
     (empty, non-numeric, zero, negative) before it is ever divided or
     stored; an invalid ratio is recorded as a report `invalidRatios` entry
     and an incompleteReason, marking the run `INCOMPLETE` - never a crash or
     an invalid `NUMERIC`.
  9. Surfaced but not resolved by this decision: DEC-014 below.

## Open

### DEC-003

- **Status:** OPEN
- **Decision:** Agentic Wallet architecture.
- **Trigger:** F001-C.

### DEC-004

- **Status:** OPEN
- **Decision:** Meaning of "simulated" per execution mode, RFQ vs calldata.
- **Trigger:** F001-B.

### DEC-005

- **Status:** OPEN
- **Decision:** assetType scope, stock only vs ETF and Pre-IPO.
- **Trigger:** F001-A results.

### DEC-006

- **Status:** OPEN
- **Decision:** Deployment region and end-user eligibility gating.
- **Trigger:** before M4.

### DEC-007

- **Status:** OPEN
- **Decision:** Confirmation semantics under a ~30 s quote TTL.
- **Trigger:** before M4.

### DEC-014

- **Status:** OPEN
- **Decision:** `docs/specs/F001A-spec.md` section 3 (T3) names
  `orchard_migrator` as the role that owns `evidence`/`rwa` schema objects,
  but no migration creates it. In practice this works today because
  `docker-compose.yml`/CI create the Postgres service's `POSTGRES_USER` as
  a superuser (via the official Postgres image's own init behavior), and
  `.env`'s `POSTGRES_USER=orchard_migrator` happens to be that name - object
  ownership then falls out of whichever role runs the migrations, not a
  role a migration explicitly created. This is undocumented reliance on
  environment-specific bootstrapping, and won't hold once Supabase-managed
  Postgres is in the picture (DEC-002), where the initial superuser is
  fixed by the platform and won't be named `orchard_migrator`.
  Options, not chosen here:
  1. Add a migration (or a pre-migration bootstrap step in `db/migrate.ts`)
     that creates `orchard_migrator` as a role and transfers/asserts
     ownership of the `evidence`/`rwa` schemas and their objects to it,
     independent of whichever role happens to run migrations.
  2. Drop the `orchard_migrator` name from the spec and document that
     schema/object ownership is simply whatever role runs migrations in
     each environment (dev: `POSTGRES_USER`; CI: the service container's
     user; Supabase: its platform-provided admin role) - accept that
     ownership is environment-defined, not a fixed role name.
  3. Keep `orchard_migrator` as a _convention_ (a recommended env value for
     `POSTGRES_USER`/the CI migrator user) without ever creating it in SQL,
     documented explicitly as a naming convention rather than a role the
     schema depends on.
- **Trigger:** before any migration or runtime code relies on
  `orchard_migrator` existing as a real, distinct role - in particular
  before Supabase project creation (DEC-002).
