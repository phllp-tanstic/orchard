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
  9. Surfaced but not resolved by this decision: DEC-014 below (resolved
     separately - see the Approved section).

### DEC-015

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Bump `vitest` to `5.0.1` (major version, `pnpm-lock.yaml`
  regenerated). Clears the critical and high advisories `pnpm audit
--audit-level=high` was reporting against `vitest@2.1.9`/its transitive
  `vite` dependency (both dev-only: a vitest UI-server file-read/execute
  advisory, GHSA-5xrq-8626-4rwp, and a vite `server.fs.deny` bypass,
  GHSA-fx2h-pf6j-xcff). `pnpm audit --audit-level=high` (added to `ci.yml`
  under DEC-013) now reports no known vulnerabilities. All existing tests
  pass unchanged under vitest 5; no test code needed to change.

### DEC-014

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Option 1 of the three listed below (originally recorded as
  OPEN): migration 007 creates `orchard_migrator` explicitly (`NOLOGIN`, only
  if it doesn't already exist) and reassigns ownership of every
  `evidence`/`rwa` schema, table, view, and trigger function to it -
  independent of whichever role actually runs migrations. `down.sql`'s
  guard for whether to drop the role checks `rolsuper`, not whether
  `current_user` happens to be named `orchard_migrator`: in this repo's own
  dev/CI setup, the Postgres bootstrap superuser created by the official
  image (via `POSTGRES_USER`) already happens to be named
  `orchard_migrator`/`orchard_ci`, and Postgres refuses to ever drop that
  bootstrap role ("required by the database system") regardless of which
  session asks. A role migration 007 actually created is always
  `NOLOGIN`/non-superuser, which is what makes it safe to drop. Verified
  against both shapes: the real dev/CI setup (skip, correctly) and a
  throwaway container with a differently-named bootstrap user (create,
  then drop and re-create cleanly across an up/down/up cycle).
- **Original decision text (for context):** the spec (section 3, T3) names
  `orchard_migrator` as the role that owns `evidence`/`rwa` schema objects,
  but no migration created it; ownership fell out of whichever role ran
  migrations (dev: `POSTGRES_USER`; CI: the service container's user), which
  works only by coincidence today and would not hold under Supabase-managed
  Postgres (DEC-002), where the initial admin role won't be named
  `orchard_migrator`. Options that were on the table:
  1. **(chosen)** Add a migration/bootstrap step that creates
     `orchard_migrator` and transfers/asserts ownership to it, independent
     of whichever role runs migrations.
  2. Drop the `orchard_migrator` name from the spec; document ownership as
     simply whatever role runs migrations per environment.
  3. Keep `orchard_migrator` as a naming convention only, never created in
     SQL.

### DEC-017

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Per-file integration test database isolation. Root cause and
  reproduction: `docs/MILESTONE_STATUS.md` ("Integration-test deadlock"
  incident, CONFIRMED). A `globalSetup` builds one fully-migrated template
  database once per `pnpm test:integration` run; each integration test file
  gets its own database created `TEMPLATE`d from it and drops that database
  in `afterAll` (`DROP DATABASE ... WITH (FORCE)`), including when tests in
  that file fail. No two files ever share a database, so the owner-role
  `TRUNCATE` negative control (kept, per DEC-010/DEC-013) can no longer
  lock-contend with an `INSERT` running concurrently in another file.
  `fileParallelism` stays at its default (parallel) - isolation is what
  makes that safe, not serializing the suite. Works against CI's Postgres
  service container using the same env vars CI already sets
  (`DATABASE_URL`, `ORCHARD_APP_DATABASE_URL`, `POSTGRES_DB`).

### DEC-019

- **Status:** APPROVED
- **Date:** 2026-09-28
- **Decision:** Widen `marketStatus` to accept `"offhours"`. Reason: the provider returned a
  value outside the documented enum, failing an otherwise-good probe run.
- **Merged:** `ce5642d` (PR #2).

### DEC-020

- **Status:** APPROVED
- **Date:** 2026-09-28
- **Decision:** Widen `assetType`, `underlyingName`, and `marketStatus` to accept `null`.
  Reason: all three came back null on live bstock rows; the docs do not mark them nullable.
- **Merged:** `49b0f42` (PR #3).

### DEC-021

- **Status:** APPROVED
- **Date:** 2026-09-28
- **Decision:** Comprehensive audit of every stored `/rwa/tokens` response; widen `paused` and
  `marketCap`. Reason: field-by-field audit beats widening one field per incident.
- **Merged:** `99877cd` (PR #4).

### DEC-022

- **Status:** APPROVED
- **Date:** 2026-09-28
- **Decision:** Bounded, read-only investigation of the platforms/tokens count mismatch
  (`/rwa/search` surfaces addresses absent from `/rwa/tokens`). Reason: establish the cause
  before changing any runtime path; outcome was partially explained, not resolved.
- **Merged:** `a51ffc7` (PR #6).

### DEC-023

- **Status:** APPROVED
- **Date:** 2026-09-28
- **Decision:** Platforms/tokens reconciliation is informational only and never gates run
  status. Reason: a provider-side inventory gap (DEC-022) is not a probe failure.
- **Merged:** `a393bf3` (PR #7).

### DEC-024

- **Status:** APPROVED
- **Date:** 2026-09-28
- **Decision:** `/rwa/price` batching defaults to 80 addresses, not the documented
  `PRICE_BATCH_MAX` of 100. Reason: 100-address batches return HTTP 414 against the
  provider's undocumented URL-length limit; 80 is the largest size verified to succeed.
- **Merged:** `2081f08` (PR #8).

### DEC-025

- **Status:** APPROVED
- **Date:** 2026-09-28
- **Decision:** `statusInfo.marketStatus` is an open string, not an enum; previously-confirmed
  values become reference-only `DOCUMENTED_MARKET_STATUSES` and the probe report counts
  undocumented values informationally. Reason: widening the enum per new value (DEC-019
  `"offhours"`, DEC-021 `"paused"`) turns each one into a failed probe run.
- **Merged:** not yet - branch `fix/dec-022-marketstatus-open-string`.

### DEC-005

- **Status:** APPROVED
- **Date:** 2026-10-02
- **Decision:** assetType scope is **Stock and ETF**. Pre-IPO is out of scope. The engine
  takes the allowed set as configuration (`allowedAssetTypes`), never a hardcoded literal,
  and every report and persisted record carries the `assetType` so an ETF is never labelled
  a stock. Reason: both are ordinary listed instruments with the same execution path, while
  Pre-IPO carries different risk and disclosure.
- **Supersedes:** the earlier OPEN entry ("stock only vs ETF and Pre-IPO", trigger F001-A).
- **Merged:** not yet - branch `feat/f002-best-execution`.

### DEC-026

- **Status:** APPROVED (resolved 2026-10-02)
- **Date:** 2026-09-29 (observed), 2026-10-02 (resolved)
- **Decision:** `referencePrice` carries different units on the two RWA endpoints, and the
  per-underlying-share price is **`/rwa/price` `referencePrice`**. Writing `T` for the
  per-token price and `R` for `tokenToShareRatio`: `/rwa/tokens` `tokenPrice` is
  `R x T`, `/rwa/tokens` `referencePrice` is `T` (**per token, NOT per share**),
  `/rwa/price` `tokenPrice` is `T`, and `/rwa/price` `referencePrice` is `T / R`
  (**per share**). Consistent with the Binance tokenized-securities rule that one token
  represents `tokenToShareRatio` shares and
  `referencePrice = tokenInfo.price / sharesMultiplier`.
- **Reason:** the original DEVEX entry recorded the measurements correctly but labelled the
  per-token quantity as per-share, which inverted the two. Confirmed live against quotes:
  `probe_run b44704bc-7870-474b-9c66-4688b6cbb9c1`, ratio >= 2 group 9 of 9 within
  51.4 bps of the per-share benchmark.
- **Note:** `tools/probe/src/pipeline.ts` compares `/rwa/tokens` `referencePrice`
  against `/rwa/price` `tokenPrice`; both are `T`, so that comparison was and remains
  same-unit and correct.
- **Merged:** not yet - branch `feat/f002-best-execution`.

### DEC-035

- **Status:** APPROVED
- **Date:** 2026-10-02
- **Decision:** `docs/specs/F002-spec.md` (Feature 002, deterministic best execution
  engine, M2) is approved as written, together with Amendment A1, which names
  `/rwa/price` `referencePrice` as the per-share benchmark and records the live evidence
  that the normalization formula passes.
- **Merged:** not yet - branch `feat/f002-best-execution`.

### DEC-036

- **Status:** APPROVED
- **Date:** 2026-10-02
- **Decision:** `maxQuoteAgeSeconds` default is **20**. Reason: the measured quote expiry is
  about 30s - a `quoteId` reused after 35s returned `40401` (F001-B) - so 20 leaves
  headroom to act on a quote before it expires. It is a policy field, not a constant.
- **Merged:** not yet - branch `feat/f002-best-execution`.

### DEC-037

- **Status:** APPROVED
- **Date:** 2026-10-02
- **Decision:** Add a reference-deviation gate to the eligibility policy.
  `policy.maxReferenceDeviationBps` rejects a candidate whose implied per-share price
  deviates from the `/rwa/price` referencePrice benchmark by more than the limit in
  **either** direction, with two reason codes:
  `REFERENCE_PREMIUM_EXCEEDS_MAX` (above the benchmark - overpaying) and
  `REFERENCE_DISCOUNT_SUSPECT` (below it - treated as a broken or stale quote, not a
  bargain). A deviation exactly at the limit is allowed. A candidate with **no** benchmark
  stays eligible and is flagged `REFERENCE_UNAVAILABLE` in the report and persisted as
  `candidate_route.reference_unavailable`; it is never treated as zero deviation.
- **Reason:** F002 Amendment A1 left a gap - a wildly mispriced route could be eligible, and
  where it was the only candidate it would have been selected. Three live candidates
  (AVGOon, MSFTon, SNDKon) were rejected by this gate in
  `probe_run 5dc1bdae-36fc-4c7b-b91e-0b5d863202e7`.
- **Also:** retracts A1's claim that the provider share unit differs from the exchange-listed
  share by about 10x. That rested on a pre-split PPLT price; PPLT ran a 10-for-1 forward split
  in May 2026 (SEC EDGAR CIK 0001460235, Form 8-K, NAV 178.62 -> 17.86). See Amendment A2.
- **Merged:** not yet - branch `feat/dec-037-reference-deviation`.

### DEC-038

- **Status:** APPROVED
- **Date:** 2026-10-02
- **Decision:** `DEFAULT_MAX_REFERENCE_DEVIATION_BPS` is raised from **300** to **500** bps.
- **Reason:** the worst ELIGIBLE deviation observed live was 91.3 bps in
  `probe_run eace2297-c3a1-44d7-bf60-14a279f3ebef` and **220.6 bps** in
  `probe_run 5dc1bdae-36fc-4c7b-b91e-0b5d863202e7`. At 300 bps that left only about **1.4x**
  headroom, close enough that an ordinary market move could reject a legitimate route. 500 bps
  gives about **2.3x**. It costs no detection power: the broken routes this gate exists to
  catch lost 81% to 100% of value and sat thousands of bps away (81149 bps, up to 3.0e10 bps),
  so the two populations are separated by orders of magnitude, not a few hundred bps.
- **Note:** still a **product default, not a measured provider limit**, and still the first
  number to revisit if a legitimate route is ever rejected.
- **Supersedes:** the 300 bps default set by DEC-037.
- **Merged:** not yet - branch `feat/dec-038-reference-deviation-500`.

## Open

### DEC-003

- **Status:** OPEN
- **Decision:** Agentic Wallet architecture.
- **Trigger:** F001-C.

### DEC-004

- **Status:** OPEN
- **Decision:** Meaning of "simulated" per execution mode, RFQ vs calldata.
- **Trigger:** F001-B.

### DEC-006

- **Status:** OPEN
- **Decision:** Deployment region and end-user eligibility gating.
- **Trigger:** before M4.

### DEC-007

- **Status:** OPEN
- **Decision:** Confirmation semantics under a ~30 s quote TTL.
- **Trigger:** before M4.
