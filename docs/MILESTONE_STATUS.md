# Milestone Status

**Status: bootstrap.** No milestone has live-verified results yet.

Status vocabulary: `VERIFIED`, `PARTIAL`, `GATED`, `NOT IMPLEMENTED`, `DEVIATED`, `UNVERIFIED`
(see `AGENTS.md`).

## M1 — Live Binance Authentication + RWA Universe

- **Status:** NOT IMPLEMENTED
- Scope: `docs/specs/F001A-spec.md` (T1-T4, pre-live scaffold and pipeline). Live acceptance
  (AC1-AC4 of Feature 001) happens in T5, run by the owner.

## Open gates

- Local Postgres major version (17) must be re-confirmed against Supabase once those projects
  are created (DEC-002).
- The `tokenToShareRatio` list-vs-profile cross-check covers only multi-representation
  underlyings. `tools/probe/src/pipeline.ts` iterates it over `multiRepTickers`, so in
  probe_run `634f558e-d77d-42eb-aed3-b5e33ca84f1b` it ran for 40 of 448 tickers - the other
  408, every single-platform underlying, received no `/rwa/underlying-profile` call and no
  ratio comparison. A ratio disagreement on a single-platform token would not be detected
  today. Recorded while investigating DEC-026; no fix is approved and none is implemented.
  Widening it to every ticker costs one profile call per representation (~485 in that run,
  against the 80 actually made), so the decision is a rate-limit and runtime trade-off, not
  a code change alone.

## Incidents

### Integration-test deadlock (2026-09-21)

- **Status:** CONFIRMED
- **Root cause:** lock-order inversion between `INSERT INTO evidence.provider_call` (provider_call,
  then probe_run FK) and owner-role `TRUNCATE ... CASCADE` (probe_run, then provider_call), in
  parallel integration test files sharing one database. The app role cannot trigger it -
  `TRUNCATE` requires the `TRUNCATE` table privilege, which `orchard_app` was never granted, so
  its attempt is rejected with a permission error before any lock is acquired; only an owner-role
  connection (used by the tests as a deliberate negative control, per DEC-010/DEC-013) can reach
  the point where locks are actually taken.
- Reproduced directly (two Node/`pg` clients against the dev database, no test framework):
  session A `INSERT`s into `evidence.provider_call` for an existing `probe_run`; session B
  (migrator/owner role) concurrently runs `TRUNCATE evidence.probe_run CASCADE`. One session's
  query is aborted by Postgres's deadlock detector.

  ```
  DETAIL:  Process 272 waits for RowShareLock on relation 16397 of database 16384; blocked by process 273.
  Process 273 waits for AccessExclusiveLock on relation 16439 of database 16384; blocked by process 272.
  ```

  (relation 16397 = `evidence.probe_run`, relation 16439 = `evidence.provider_call`, confirmed via
  `pg_class`.)

- **Fix:** DEC-017 (per-file test database isolation) - no two integration test files share a
  database, so the owner-role `TRUNCATE` negative control in one file can no longer contend for
  locks with an `INSERT` running concurrently in another.

#### Runbook note

A `TRUNCATE` that is ultimately rejected by the append-only `BEFORE TRUNCATE STATEMENT` trigger
still acquires `ACCESS EXCLUSIVE` locks on the target table (and, with `CASCADE`, on every table
it cascades to) _before_ the trigger fires and raises the exception. Locking happens during
executor startup, ahead of any trigger invocation - the eventual rejection does not mean the
statement was ever lock-free. A `TRUNCATE` negative-control test is therefore never "safe by
virtue of always failing": while it runs, it can still deadlock with, or block, any concurrent
transaction touching the same tables, right up until the moment it's rejected and rolls back.
