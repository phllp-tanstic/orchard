# Feature 001-A: Live RWA Universe Probe (Tasks T1 to T4)

Status: APPROVED (DEC-001, 2026-09-21). Governing method: `skills/spec-driven-build/SKILL.md`.
This file is the authoritative spec for T1 to T4. If anything here is wrong or ambiguous, stop and report. Do not code around it.

## 1. Goal

Prove, from live Binance Web3 API data, which tokenized-stock representations exist on BSC (chain 56), which underlyings have more than one representation, and whether token/share ratios and `referencePrice` behave as documented. No UI, no wallet, no quotes, no signing, no money.

## 2. Decisions this spec implements

| ID | Decision |
|---|---|
| DEC-001 | Feature 001 approved, split A (read-only universe), B (quotes and simulation, no signing), C (owner-driven Agentic Wallet probe). This spec covers A only |
| DEC-002 | PostgreSQL from the first commit. Production and staging: Supabase (separate projects, created later). Development and tests: local Postgres in Docker. CI: Postgres service container |
| DEC-008 | License Apache-2.0. Copyright holder: phllp-tanstic |
| DEC-009 | Repository is public from the first commit |
| DEC-013 | Spec Amendment A2, hardening set: terminal-event concurrency, gitleaks exact-value allowlist, Node 24, Postgres bound to localhost, `migrate down` guarded by an env var, `rwa.*_snapshot` append-only plus `binance_chain_id` widened to text, format/audit CI gates, `tokenToShareRatio` validation. See section 11 |

## 3. Scope

### T1. Repository scaffold
- pnpm workspace, TypeScript (strict), Node 20+, vitest, zod, decimal.js, ESLint, Prettier.
- Extend, do not overwrite: `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`, `.env.example`.
- Never modify `docs/ORCHARD_*.md`.
- Create `docs/{PRODUCT,DECISIONS,MILESTONE_STATUS,EVIDENCE_LEDGER,DEVEX_LOG}.md` skeletons.
  - `DECISIONS.md` records DEC-001, DEC-002, DEC-008, DEC-009 as approved, and DEC-003 to DEC-007 as open (text in section 9).
  - `DEVEX_LOG.md` uses the entry template from blueprint section 16 with an `Author` field. Agents never write narrative entries.
  - Create `docs/DEVEX_CANDIDATES.md` for raw doc ambiguities agents hit (doc page, section, observation), for the owner to reproduce or discard.
- `.env.example` adds `DATABASE_URL=` (empty). Never write a value.
- **License:** download the canonical text from `https://www.apache.org/licenses/LICENSE-2.0.txt` into `LICENSE`, unmodified. Record its sha256 in the completion report. Add `NOTICE` containing `Orchard` and `Copyright 2026 phllp-tanstic`. `"license": "Apache-2.0"` in every `package.json`. One README line naming the license.
- **Local Postgres:** `docker-compose.yml` with the official `postgres` image, major version 17, pinned by digest (resolve the current 17.x digest and record tag plus digest in the completion report). Named volume, healthcheck, credentials read from a git-ignored `.env`. Open gate: re-confirm the major version matches Supabase when those projects are created (record in `MILESTONE_STATUS.md`). **Amended by DEC-013 (Spec Amendment A2):** the port binds to `127.0.0.1:5432:5432`, not all interfaces.
- **Pre-commit hook (required):** husky hook running gitleaks 8.30.1 in staged mode, using the exact command documented by `gitleaks --help` for 8.30.1. If gitleaks is missing or the version differs, the hook fails the commit with install instructions. Never skip silently.
- **CI** (`.github/workflows/ci.yml`): install, lint, typecheck, unit tests, integration tests against a Postgres 17 service container, migration up/down check. No live provider calls in CI, ever. **Amended by DEC-013 (Spec Amendment A2):** Node 24; a format-check step (`pnpm format:check`) and a dependency-audit step (`pnpm audit --audit-level=high`); a pinned, checksum-verified gitleaks 8.30.1 install so `test/gitleaks-regression.test.ts` can run; `migrate down` only runs with `ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1` set for that one step.
- **Pin every GitHub Action by full commit SHA** with the version as a trailing comment, in `ci.yml` and in `secret-scan.yml`. In `secret-scan.yml` change nothing else. Resolve SHAs from the actions' official release tags.
- `.gitleaks.toml`: add rules only, never remove or weaken. Add a rule for a Postgres connection string with an embedded password assigned to `DATABASE_URL`, with negative-control tests like the existing Binance rules. **Amended by DEC-013 (Spec Amendment A2):** the original `test/fixtures/(SYNTHETIC_|DOC_EXAMPLE_)*` path allowlist is removed - it exempted an entire directory rather than one value - and replaced with an exact-value allowlist for the one fixture secret that needs it (`SYNTHETIC_TEST_SECRET_0123456789`).

### T2. `packages/binance`: signed client
- Signing per https://web3.binance.com/en/dev-docs/authentication: preHash = timestamp + METHOD + requestPath (must include `/build` prefix, raw URL-encoded query) + body. HMAC-SHA256, base64. ISO-8601 millisecond timestamp. Fresh timestamp and `X-OC-NONCE` per attempt. `X-OC-RECV-WINDOW` configurable.
- Envelope: `code != 0` is an error even on HTTP 200. Typed errors for 40001, 40101, 40102, 40103, 40104, 42900, 50000, 50001. Unknown codes preserved verbatim.
- 429 honors `Retry-After`. Retries always re-sign. No retry on 40101, 40102, 40104.
- Client-side limiter below documented limits (5 rps per endpoint, 1200 per 60 s per key). Record `X-OC-RateLimit-*` headers.
- Secrets from env only. Never logged, never persisted, never in errors.
- Every call passes through the evidence recorder (T3).

### T3. `packages/evidence` and `db/`
- Migrations: SQL files run by `node-pg-migrate`, with up and down.
- Schemas: `evidence` and `rwa`. **Nothing in `public`** (Supabase exposes `public` through its auto-generated API).
- Roles: `orchard_migrator` owns objects. `orchard_app` has INSERT and SELECT on evidence tables, no UPDATE, DELETE or TRUNCATE. A trigger additionally rejects UPDATE, DELETE, and TRUNCATE (statement-level) on evidence tables, with no exceptions, including for the owner role. Enable Row Level Security on every table. **Open gap (DEC-013 A2):** no migration actually creates `orchard_migrator` - see docs/DECISIONS.md DEC-014 (open).
- Tables (minimum) — **amended by DEC-010 (Spec Amendment A1)**, further amended by **DEC-013 (Spec Amendment A2)**:
  - `evidence.probe_run`: immutable header. id, started_at, git_sha, client_version. No status column; a header row is never mutated after insert.
  - `evidence.probe_run_event`: append-only. id, probe_run_id, status (`RUNNING`/`COMPLETE`/`INCOMPLETE`/`FAILED`), incomplete_reasons (jsonb, nullable), recorded_at. The header and its `RUNNING` event are inserted in one transaction. Once a terminal event (`COMPLETE`/`INCOMPLETE`/`FAILED`) exists for a run, a trigger rejects any further event for that run (no status regression, no re-opening a finished run). **DEC-013 A2:** the original trigger-only check raced under concurrent writers (it cannot see another transaction's uncommitted terminal event); a partial unique index (`probe_run_id` where status is terminal) now enforces at most one terminal event per run at the storage layer, and the trigger serializes inserts per run with `pg_advisory_xact_lock` so the check runs against committed state.
  - `evidence.probe_run_current`: a view over `probe_run` and `probe_run_event` exposing run id, latest status, incomplete_reasons, and finished_at (the time of the terminal event, null while `RUNNING`). **DEC-013 A2:** the view's tie-break now prefers the terminal event over any other event regardless of commit order, matching the concurrency fix above.
  - `evidence.provider_call`: id, probe_run_id, provider, method, endpoint, redacted_request (jsonb), http_status, provider_code, latency_ms, rate_limit_headers (jsonb), response_sha256, raw_response (bytea, exact bytes), response_json (jsonb, nullable), created_at.
  - `rwa.platform_snapshot` and `rwa.token_snapshot`, linked to probe_run and provider_call. Every provider numeric stored twice: exact string as received, and `NUMERIC` (never float). **DEC-013 A2:** both tables are now append-only (reuse `evidence.reject_mutation()`), matching the rest of the evidence-adjacent tables; `token_snapshot.binance_chain_id` widens from `integer` to `text` because the RWA data API documents `binanceChainId` as a string and a non-EVM chain id (e.g. Solana's `"CT_501"`) cannot fit in an integer column.
  - The report generator (T4) only marks a run `COMPLETE` by reading `evidence.probe_run_current`; a run with no terminal event is never reported complete.
- Redaction: request params in a configured sensitive list (for example `userWalletAddress`, `address`) are stored as salted sha256 in `redacted_request`. Salt from env, git-ignored.
- `pnpm evidence:export --run <id>`: writes redacted artifacts to `evidence/export/<sha256>.json` and appends to `evidence/manifest.jsonl` (provider, endpoint, status, provider code, latency, sha256, timestamp, run id). Export only. The owner reviews and commits by hand.

### T4. `packages/rwa` and `tools/probe`
- zod schemas for `GET /api/v1/dex/market/rwa/{platforms,tokens,price,search,underlying-profile}` per https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data. Missing required fields or type mismatches fail visibly. Unknown extra fields are kept and reported, not dropped.
- `pnpm probe:rwa` pipeline:
  1. Platforms from the API. Never hardcode platform IDs.
  2. Tokens for `binanceChainId=56` per discovered platform. Reconcile the count against that platform's chain-56 `tokenCount`. Any mismatch is recorded and makes the universe untrusted.
  3. Normalize with decimal.js: `impliedPricePerShare = tokenPrice / tokenToShareRatio`. **DEC-013 A2:** an empty, non-numeric, zero, or negative `tokenToShareRatio` is never divided or stored - it's recorded as an entry in the report's `invalidRatios` list and as an incompleteReason, marking the run `INCOMPLETE`; the rest of that token's platform is still processed.
  4. Group only by explicit `underlyingTicker`. Flag conflicting `underlyingName` or `assetType` within a ticker. Never derive tickers from symbols.
  5. For every multi-representation token, fetch `underlying-profile` and compare its `tokenToShareRatio` with the list value.
  6. `/rwa/price` in batches of at most 100. Report `tokenPriceUpdatedAt` staleness.
  7. Report the distribution in bps of `referencePrice` vs `tokenPrice` and vs `tokenPrice / tokenToShareRatio`, stating whether `referencePrice` appears independent or derived.
- Output: `reports/rwa-universe.json` with the blueprint M1 fields (`totalRepresentations`, `uniqueUnderlyings`, `multiRepresentationUnderlyings`, `platformCounts`, `generatedAt`) plus reconciliation, assetType and marketStatus breakdowns, overlap matrix, ratio anomalies, staleness, referencePrice analysis, probe_run id, git SHA. `reports/rwa-universe.md` is generated from the JSON only.
- Any failed phase: run marked `INCOMPLETE` with reasons. Never a partial report presented as complete.
- `reports/` is git-ignored until the owner reviews it.

## 4. Hard rules

- No hardcoded tickers, token addresses, platform lists, or synthetic data in any runtime path. Chain 56 is configuration, not data.
- Test fixtures only in `test/fixtures/`, prefixed `DOC_EXAMPLE_` or `SYNTHETIC_`. A check enforces they are never imported from `src` and never written to the database or `evidence/`.
- Money and ratio math uses decimal.js and `NUMERIC`. No JavaScript floats.
- The builder cannot reach the Binance API (region checks, no key). Never fabricate live output. The owner runs the live probe (T5).

## 5. Tests (required, exact results in the report)

- Signer: preHash and signature against an independently generated vector (document how it was generated), including a query with characters needing encoding.
- Error mapping for every listed code, unknown-code passthrough, 429 with Retry-After, re-sign on retry.
- Limiter behavior.
- Decimal normalization, including ratios with many decimal places.
- Schema drift: missing field fails, extra field reported.
- Grouping and conflict flags.
- Fail-closed `INCOMPLETE` path.
- Fixture isolation check.
- Integration (Postgres container): migrations up/down; `orchard_app` cannot UPDATE or DELETE evidence (expect permission error); trigger rejects UPDATE/DELETE even as owner; redaction hashes sensitive params; export writes only redacted content.
- **Amended by DEC-010 (Spec Amendment A1):** `probe_run` header and its `RUNNING` event insert atomically in one transaction; a terminal event (`COMPLETE`/`INCOMPLETE`/`FAILED`) is accepted; any event submitted after a terminal event for that run is rejected; UPDATE, DELETE, and TRUNCATE are rejected on both `probe_run` and `probe_run_event` even as the owner role; `evidence.probe_run_current` returns the latest status and correct finished_at; `orchard_app` can INSERT but not UPDATE or DELETE on these tables.
- gitleaks: new `DATABASE_URL` rule catches a fake credentialed URL in a throwaway copy outside the repo; empty `.env.example` stays clean.
- **Amended by DEC-013 (Spec Amendment A2):** concurrent terminal-event inserts for the same run - exactly one succeeds, one terminal row results, `probe_run_current` shows the terminal status; a `RUNNING` event submitted after a terminal event is rejected; `rwa.platform_snapshot`/`rwa.token_snapshot` reject UPDATE, DELETE and TRUNCATE even as the owner role; `token_snapshot.binance_chain_id` accepts a non-numeric value (`"CT_501"`); `db/migrate.ts down` refuses to run without `ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1`; a pinned gitleaks binary run against throwaway temp directories and this repo's own history proves the exact-value allowlist (no path allowlist); `tokenToShareRatio` of `""`, `"abc"`, `"0"`, or a negative value is recorded as an `invalidRatios` entry and marks the run `INCOMPLETE`, never a crash or an invalid `NUMERIC`.

## 6. Acceptance (T1 to T4, pre-live)

- CI green with lint, typecheck, unit and integration tests, SHA-pinned actions.
- Pre-commit hook blocks a staged fake secret and fails when gitleaks is absent.
- `pnpm probe:rwa` against an unreachable or unauthorized endpoint produces a FAILED or INCOMPLETE run with the provider error recorded as evidence, and no report claiming completeness.
- Live acceptance (AC1 to AC4 of Feature 001) happens only in T5, run by the owner.

## 7. Stop conditions

- The spec conflicts with the blueprint, the docs, or observed provider documentation: stop and report.
- A required test cannot be made to pass without weakening a rule: stop and report.

## 8. Non-goals

UI, quotes, simulation, wallet, signing transactions, broadcast, intents, gifting, Agent Studio, any LLM code, Supabase project creation.

## 9. Open decisions (record in DECISIONS.md as OPEN)

- DEC-003: Agentic Wallet architecture (trigger: F001-C).
- DEC-004: meaning of "simulated" per execution mode, RFQ vs calldata (trigger: F001-B).
- DEC-005: assetType scope, stock only vs ETF and Pre-IPO (trigger: F001-A results).
- DEC-006: deployment region and end-user eligibility gating (before M4).
- DEC-007: confirmation semantics under a ~30 s quote TTL (before M4).
- DEC-014: this spec (section 3, T3) names an `orchard_migrator` role that owns objects, but no migration creates it. Options are listed, not chosen, in docs/DECISIONS.md (trigger: before any migration relies on `orchard_migrator` existing as a distinct role, e.g. before Supabase project creation).

## 10. Completion report (exact format)

Files changed | behavior implemented | tests run with exact results | resolved pins (Postgres tag and digest, action SHAs, LICENSE sha256) | blockers and gates | deviations from this spec | unverified claims.
Never write "works", "live" or "verified" for anything not exercised against the real provider.

## 11. Amendment A2 (DEC-013): hardening set

Resolves gaps found after T1-T4 review, before owner sign-off. Each item is cross-referenced
inline at the section it amends; this section is the index.

1. **Terminal-event concurrency** (section 3, T3): the DEC-010 trigger-only check races under
   concurrent writers. Migration 005 adds a partial unique index and an advisory-lock-serialized
   trigger so at most one terminal event per run is ever committed.
2. **gitleaks exact-value allowlist** (section 3, T1): the path-based allowlist for
   `test/fixtures/(SYNTHETIC_|DOC_EXAMPLE_)*` exempted an entire directory. Replaced with an
   exact-value allowlist for the one fixture secret that needs it.
3. **Node 24**: `package.json` engines, `ci.yml`, and a new `.nvmrc` move from Node 20 to 24.
4. **docker-compose.yml**: the local Postgres port binds to `127.0.0.1` only, not all interfaces.
5. **`db/migrate.ts down` guard**: refuses to run unless `ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1`
   is set; `ci.yml` sets it only for the "Migration down" step.
6. **`rwa.*_snapshot` hardening** (section 3, T3): migration 006 makes `rwa.platform_snapshot`
   and `rwa.token_snapshot` append-only and widens `token_snapshot.binance_chain_id` from
   `integer` to `text` (the RWA data API documents it as a string; a non-EVM chain id like
   Solana's `"CT_501"` doesn't fit in an integer).
7. **CI gates**: `pnpm format:check` and `pnpm audit --audit-level=high` added to `ci.yml`.
8. **`tokenToShareRatio` validation** (section 3, T4): an empty, non-numeric, zero, or negative
   ratio is recorded as a report `invalidRatios` entry and an incompleteReason, never thrown or
   written to a `NUMERIC` column.
9. **Open gap surfaced, not resolved**: DEC-014 (section 9) - no migration creates the
   `orchard_migrator` role this spec names as the object owner.
