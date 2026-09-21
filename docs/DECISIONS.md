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
