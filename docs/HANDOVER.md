# Handover

Format: `docs/ORCHARD_PRODUCTION_BLUEPRINT.md` section 22 (Handover Protocol).

Status vocabulary is `AGENTS.md`'s: `VERIFIED`, `PARTIAL`, `GATED`, `NOT IMPLEMENTED`,
`DEVIATED`, `UNVERIFIED`. Nothing below is written as done, live, integrated or working
without the evidence that word implies. Every figure here comes from a stored run, a stored
decision or a measurement taken while writing this file; where a number could not be
verified it says so instead of guessing.

## Source

- **Repository:** `https://github.com/phllp-tanstic/orchard` (public from the first commit).
- **Branch:** `feat/f002-best-execution`, based on `main` at `43fba45`.
- **Commit SHA:** the commit that introduces this file; the preceding commit on this branch
  is `50616ea` (F002 spec, committed unchanged).
- **State:** clean at the time of writing (no tracked modifications outside this branch's
  own commits).

## Deployment

- **Public URL:** none. Nothing is deployed.
- **Deployment identifier:** none.
- **Capability state:** local only. The repository is a monorepo of libraries, two read-only
  probes and a Postgres evidence store. There is no frontend, no backend service, no
  contract deployed by this project, and no wallet integration.

## Verification

- **Tests passed:** measured on this branch - unit `280 passed / 21 files`, exit 0;
  integration `24 passed / 4 files`, exit 0 (requires local Postgres, see How to run).
  `eslint .` exit 0, `pnpm format:check` exit 0, `pnpm typecheck` 5/5 packages.
- **Live probes:** M1 closing run `probe_run_id 26943e2a-cd8e-4214-ad44-f60c216d56d7`
  (terminal event `COMPLETE`, `git_sha a81f3b4`): 445 unique underlyings across 485
  representations (ondo 442, bstock 46), 40 tickers present on both platforms.
  F001-B quote feasibility run `probe_run_id 1f42f52f-a9c8-463d-8bf9-a344758f3b6c`:
  96 representations sampled, 181 successful quotes.
  F001-B approve-leg assessment `probe_run_id ef176412-9d7e-45a0-90f7-745518c7ef7f`:
  12 approve-transaction calls and 12 simulate calls, all envelope code 0.
- **Mainnet tx hashes:** none. This project has never signed or broadcast a transaction.
- **Provider operations verified:** `VERIFIED LIVE` - authenticated Binance Web3 requests
  (HMAC signing, rate limiting, typed errors); `/rwa/platforms`, `/rwa/tokens`, `/rwa/price`,
  `/rwa/underlying-profile`, `/rwa/search`; `/aggregator/quote`, `/aggregator/swap`,
  `/aggregator/approve-transaction`; `/pre-transaction/simulate`.
  Not exercised: `/order/submit`, `/pre-transaction/broadcast-transaction`, any signing path.

### Provider facts established live (these are inputs to F002)

- USDT on BSC is **18 decimals**, confirmed from the `fromToken.decimal` the provider echoes
  on its own quote responses, not assumed from a token list.
- `executionMode` was **SWAP on 181/181** returned routes and the only vendor observed was
  **LiquidMesh**, although the documentation describes RFQ for equities. Both are treated as
  open strings everywhere in code.
- The approve leg simulates from a zero-balance address (status `SUCCESS`, one
  `allowanceChanges` entry); the swap leg reverts on the same address
  (`execution reverted: BEP20: transfer amount exceeds allowance`). The Simulate
  Transactions endpoint documents **no state, balance, allowance or account override and no
  fork-at-block pinning**, so a transfer-bearing simulation cannot be made meaningful from an
  unfunded address.
- `/swap` rejects a request carrying neither `slippagePercent` nor `autoSlippage` with code
  `40001`, although the doc page lists both as optional.
- Quote TTL is about 30s: a `quoteId` reused after 35s returned `40401`.
- Undocumented quote error codes `40367` (non-trading session) and `40374` (insufficient
  liquidity) account for every quote failure observed; `40367` is market-hours dependent.
- **`/rwa/price` `referencePrice` is the per-underlying-share price** and is the only
  per-share field. `/rwa/tokens` `referencePrice` is per-TOKEN and `/rwa/tokens`
  `tokenPrice` is that value scaled again by `tokenToShareRatio`; neither is per-share
  (F002 Amendment A1, DEC-026 resolved). Normalization
  `normalizedShares = (toTokenAmount / 10^decimals) * tokenToShareRatio` was confirmed
  against it: ratio >= 2 group 9/9 within **51.4 bps** (`probe_run
b44704bc-7870-474b-9c66-4688b6cbb9c1`).
- **`priceImpactPercent` is a FRACTION in [0,1], not a percentage**, despite the name and the
  doc wording. Four live routes lost 81-100% of value while reporting 0.93-0.9996. Converting
  with x100 rather than x10000 is 100x too permissive, in the dangerous direction.
- **The provider share unit is consistent with the exchange-listed share.** An earlier claim of
  a ~10x mismatch rested on a stale pre-split PPLT price: PPLT ran a 10-for-1 forward split in
  May 2026 (SEC EDGAR CIK 0001460235, Form 8-K; NAV 178.62 -> 17.86), so the observed
  per-share benchmark of 15.709643 is in the right range. Evidence level: primary SEC filings
  for the split, third-party price pages through late July 2026, and **no same-time quote** -
  consistent and unrefuted rather than measured (F002 Amendment A2).
- Across the 40 multi-representation tickers the two platforms agreed on the per-share
  benchmark to within **49.6 bps**, so cross-platform comparability is measured, not assumed.

## Current Milestone

- **Intended capability:** M2, the deterministic best-execution engine of
  `docs/specs/F002-spec.md` - discover every eligible tokenized representation of an
  underlying, obtain a real quote for each, normalize to comparable underlying shares, rank
  deterministically, and persist why the winner won. Read-only.
- **Actual capability:** M1 is `CLOSED / COMPLETE (VERIFIED)`. F001-B (quote and simulation
  feasibility) is merged. **F002 T1-T5 are implemented and merged** (PR #17): the
  `@orchard/execution` domain (normalization, eligibility policy, deterministic ranking
  `f002-rank-1.0.0`), the orchestrator, the append-only `execution.*` schema
  (migrations 008-009) and `pnpm route:probe`. DEC-037 adds the reference-deviation gate and DEC-038 sets its default to 500 bps.
  Live acceptance has been run: NVDA at 100 USDT with both representations quoted
  independently and the report reconciling byte-for-byte against the stored
  `provider_call` rows, and a 40-ticker batch
  (`probe_run eace2297-c3a1-44d7-bf60-14a279f3ebef`) with 40/40 selected, wins bStock 27 /
  Ondo 13, worst platform spread 88 bps.
  Status is `VERIFIED` for what those runs show and nothing more: eligibility is market-hours
  dependent, so a platform win count belongs to its run, not to the product.
- **Incomplete work:** everything beyond M2 is `NOT IMPLEMENTED`. M3 (simulation) is blocked
  on DEC-029; M5 (execution) on F001-C and DEC-003.

## Gates

### Credentials

- Binance Web3 API key and secret are required for every live probe. They live only in a
  local `.env`, which is git-ignored; live provider calls are run locally by the owner and
  never in CI.
- **F001-C (Agentic Wallet capability probe) is `GATED` and not started.** It needs the
  owner's Binance account and an interactive QR sign-in, which no agent can perform.

### Provider support

- **DEC-029 (what "simulated" means for this product) is OPEN.** The evidence it must be
  decided from: the approve leg simulates, the swap leg reverts without an allowance, the
  Simulate API offers no state override, `executionMode` was SWAP on 181/181 routes, and the
  only vendor seen was LiquidMesh. No definition has been written; F001-B deliberately
  stopped short of drafting one.
- **DEC-032 is an open fix:** the provider names its human-readable error field `msg`, but
  `ProviderEnvelope` declares `message`, so `BinanceApiError`'s own message drops the
  provider's explanation. The text is still preserved on the raw envelope and in evidence.

### Liquidity

- Ineligibility is a normal outcome, not a failure: quote success was 81/96 and 61/96 an hour
  apart on the same seeded sample, differing only in how many underlyings were in a trading
  session. Any statement about eligibility is only true for the run that produced it.

### Transfer / gift eligibility

- Not investigated. Gift mechanism (blueprint options A/B/C) is `NOT IMPLEMENTED` and
  untested against the provider.

### Funds

- **DEC-033 (funded swap simulation) is DEFERRED**, and the reason is a safety finding, not
  scheduling. The spender the Binance Trading API returns as `approveTarget` /
  `dexContractAddress`, `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`, is **UNRESOLVED**:
  - an unverified EIP-2535 diamond proxy, with **6 facets that are all unverified** - so the
    swap logic cannot be read from any reachable source;
  - `owner()` is an **EOA, `0x1c6f8a6d1011ca0334f6f8f5e2f9222ef1b68fa9`**, with no code, so a
    single private key can `diamondCut` the logic and whitelist arbitrary call targets;
  - its proxy bytecode matches the shell of the contract explorers name-tag
    **"Binance: DEX Router"** - the shell **only**; none of its 6 facets shares bytecode with
    that contract's 8 facets, and that contract's verified source contains no swap logic
    either.
  - **Do not approve this spender from a real wallet without new evidence.**
- A dedicated test wallet exists. **No approvals have been made from it.** No wallet has ever
  signed anything in this project.

### Wallet integration

- **M5 (execution) and DEC-003 (wallet path) are OPEN and both depend on F001-C.** Per the
  blueprint, the Agentic Wallet is the **primary** execution path. The standard-wallet
  fallback is to be used **only** if F001-C's evidence requires it **and** the owner approves
  that specific deviation.

### Known data limits

- **Platforms-vs-tokens count gap (DEC-023, informational only, never gates run status).** In
  the M1 closing run the platforms endpoint reported more tokens than the tokens endpoint
  returned: ondo 458 reported vs 442 actual (**16**), bstock 80 reported vs 46 actual
  (**34**) - **50 total in that run**. DEC-022's read-only investigation then recovered **at
  least 21** of those addresses (17 bstock, 4 ondo) via `/rwa/search`, which is a lower
  bound rather than the full population - leaving **up to 29 unaccounted for**. The gap is
  provider-side and time-varying; treat each figure as belonging to its run, not as a
  constant.
- **3 tokens are excluded for a null `assetType` or `underlyingName`** (DEC-020). They cannot
  be grouped or typed, so they never enter normalization. F002 rejects them explicitly with
  reason code `NULL_IDENTITY` rather than dropping them silently.
- The `tokenToShareRatio` list-vs-profile cross-check covers only multi-representation
  underlyings - 40 of 448 tickers in the run that measured it. A ratio disagreement on a
  single-platform token would not be detected today. No fix is approved.

### Open fixes

- DEC-032, above.
- **Flaky timeout tests.** `db/migrate.test.ts`'s destructive-migration guard (5s timeout) and
  `test/gitleaks-regression.test.ts`'s `beforeAll` (10s timeout) can time out under
  load-heavy parallel runs. Confirmed load-correlated, not content-correlated, by A/B testing.
  Reproduced again while writing this file: the full suite failed once on
  `migrate.test.ts` (1 failed / 279 passed), then passed 280/280 on an immediate re-run, and
  that file passes 3/3 in isolation. Not yet fixed.

## Next Dependency-Ordered Tasks

1. F002 T1-T5 (this branch): execution domain and normalization, eligibility policy,
   deterministic ranking, orchestrator and `execution.*` persistence, `route:probe` CLI and
   report.
2. F002 live acceptance, owner-run: `route:probe` on one ticker and on the 40-ticker batch,
   during market hours, with the report's numbers reconciled against the stored
   `provider_call` rows.
3. Decide DEC-029 (what "simulated" means) from the evidence already gathered.
4. F001-C: Agentic Wallet capability probe (owner-interactive, QR sign-in).
5. Decide DEC-003 (wallet path) from F001-C's evidence.
6. Resolve the spender provenance question, or accept it as a documented risk with a written
   owner decision, before any approval is signed from a funded wallet.
7. M3 simulation, then M5 execution - both blocked on 3, 4, 5 and 6.

## Prohibited Shortcuts

Carried from blueprint section 22, and each one is currently respected:

- No hardcoded ticker universe presented as provider discovery. Tickers, addresses, vendors,
  execution modes and asset types are all discovered or configured, never literals in a
  runtime path.
- No mock quote in a live path. Test fixtures live only in `test/fixtures/`, are prefixed
  `DOC_EXAMPLE_` or `SYNTHETIC_`, and are never imported from `src`.
- No static "best route" label. A ranking claim is only ever made from a stored live run.
- No fake transaction success. Nothing has been signed or broadcast.
- No gift funded badge without locked or settled funds.
- Additionally: no LLM decides money movement, route selection, amount adaptation or
  authorization; those are deterministic code.

## How to run

Live provider calls are run locally by the owner, never in CI.

```bash
pnpm install

# Local Postgres for the evidence store (docker-compose.yml)
docker compose up -d
pnpm migrate:up

# Rolling back. The count is REQUIRED: `pnpm migrate:down` with no count is
# refused, because it used to default to "all" and emptied a local evidence
# database when the operator believed it stepped back one.
pnpm migrate:down 1                            # needs ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1
pnpm migrate:reset -- --confirm <databaseName>  # needs ORCHARD_ALLOW_FULL_RESET=1
# reset prints the database name and every evidence table's row count first.

# Read-only live probes
pnpm probe:rwa      # RWA universe -> reports/rwa-universe.{json,md}
pnpm probe:quote    # quote feasibility -> reports/quote-feasibility.{json,md}

# Deterministic best execution (F002). Read-only: /rwa/tokens, /rwa/price, /quote.
pnpm route:probe -- --ticker NVDA --amount 100
pnpm route:probe -- --batch --amount 100   # every multi-representation ticker

# Web app (F003). web:build runs the client-bundle secret scan as a post-build
# step, so a leaked secret fails the build - on a host too, not only in CI.
pnpm universe:refresh   # stored universe snapshot, live; needed before search works
pnpm web:build
pnpm web:dev            # http://localhost:3000, reads the repo-root .env

# Checks
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm test:web           # component tests (jsdom)
pnpm test:integration   # needs Postgres reachable on localhost:5432
pnpm test:e2e:stub      # browser tests with NO provider call - this subset runs in CI
pnpm test:e2e:live      # browser tests against the real provider - owner-run, local only
```

The browser suite is split by tag for one reason: AGENTS.md forbids live provider calls in CI.
The `@stub` subset intercepts `/api/previews` inside the browser or exercises pages that read
only the database, and CI runs it against an obviously synthetic universe seed (ticker `SYNTH`,
written through the real writer) with the provider base URL pointed at a closed local port so
no request can reach the provider even by accident. The `@live` tests are the owner's.

Required `.env` keys - **names only, never values** (see `.env.example`):

`BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_API_SECRET`, `BINANCE_WEB3_BASE_URL`,
`TARGET_BINANCE_CHAIN_ID`, `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`, `EVIDENCE_REDACTION_SALT`, `ORCHARD_APP_DB_PASSWORD`,
`ORCHARD_APP_DATABASE_URL`.

Optional: `ETHERSCAN_API_KEY` (read-only contract provenance checks only; free tier does not
cover BSC for `getcontractcreation` or the `account` module), and the `PROBE_*` overrides
documented in `.env.example`.

`reports/` and `evidence/raw/` are git-ignored. Only `evidence/manifest.jsonl` is committed,
and it carries safe metadata only - no secrets, no signatures, wallet addresses redacted or
hashed.
