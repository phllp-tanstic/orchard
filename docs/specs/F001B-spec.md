# Feature 001-B: Quote and Simulation Feasibility

Status: DRAFT, awaiting owner approval (DEC-027). Governing method: `skills/spec-driven-build/SKILL.md`.
Builds on Feature 001-A (CLOSED/VERIFIED). Read AGENTS.md and F001A-spec.md first; do not
duplicate their content, extend it.

## 1. Goal

F001-A proved 445 tokenized-stock underlyings exist on BSC, 40 of them on both Ondo and
bStock. F001-B answers whether Orchard can actually **quote, cost-compare, and pre-validate**
a purchase of those tokens before any real money moves — the blueprint's Stage B (section 7)
and the "simulate before execution" invariant (section 9, #8).

Confirmed from the Trading API docs (2026-09, re-verified against the live source, not
memory):

- `GET /quote` returns routes; for equity/RWA tokens (Ondo, bStock), `executionMode` is
  **always `RFQ`**, never `SWAP`. `quoteId` TTL is ~30s.
- `GET /swap` turns a quoted route into either a `tx` object (SWAP mode — raw calldata to
  sign and broadcast) or an `rfq` object (RFQ mode — `typedDataToSign` for EIP-712,
  `POST /order/submit`, then poll `GET /order/{orderId}`). RFQ mode never returns a `tx`.
- The Transaction API's `Simulate Transactions` endpoint (per the original ingestion report,
  UNVERIFIED in this project until now) is documented to take a raw `evmTx`. An RFQ order has
  no `evmTx` until it is signed and submitted — by which point it is no longer a dry run.
- The ERC-20 approve step (`GET /approve-transaction`) **does** produce raw calldata (a `data`
  field), for both the standard DEX router and, when `vendor=<vendorName>` is passed, the
  RFQ vendor's spender contract. That calldata is a real candidate for `Simulate Transactions`.

So the central open question is: **for a tokenized-stock RFQ route, is there anything to
simulate at all, and if so, what exactly?** This spec finds out empirically rather than
assuming either way.

## 2. Decisions this spec implements

| ID      | Decision                  |
| ------- | ------------------------- |
| DEC-027 | F001-B approved (pending) |

## 3. Scope

### T1. `packages/binance` extension: Trading API client

- New request builders for `GET /quote`, `GET /swap`, `GET /approve-transaction`,
  `GET /aggregator/supported/chain`. Reuse the existing signer/limiter/error machinery from
  F001-A verbatim — do not fork it.
- Every field kept as the provider's exact string (amounts, prices, gas). No floats.
- `executionMode`, `vendorName`, `approveTarget`, `rfq.vendor`, `rfq.typedDataToSign`,
  `rfq.signatureData` parsed with zod, unknown fields reported the same way F001-A's RWA
  schemas do (not silently dropped).
- Every call goes through the evidence recorder (already built in F001-A). No new evidence
  infrastructure needed.

### T2. `packages/binance` extension: Transaction API client (simulate only)

- `POST /transaction/simulate` (exact path per the live Transaction API doc — re-verify
  against the current doc page before coding, do not assume the ingestion report's path is
  current).
- **No broadcast client in this feature.** Building `/transaction/broadcast` support is out
  of scope until M5.

### T3. `tools/probe-quote`: quote feasibility probe

- Input: a deterministic sample set drawn from F001-A's stored evidence — every one of the
  40 multi-representation tickers (both platforms), plus a random sample of 20
  single-representation tickers (10 Ondo, 10 bStock), seeded for reproducibility.
- For each sampled representation, at 3 spend sizes (configurable; default $10/$100/$1000 in
  USDT smallest-unit terms, decimal-correct per USDT's `decimal`):
  1. Call `GET /quote` with `userWalletAddress` set to a configured **read-only probe
     address** (see DEC-028 below — no private key, no signing capability needed for this
     endpoint).
  2. Record `executionMode`, every `vendorName` returned, `toTokenAmount`, `priceImpactPercent`,
     `tradeFee`, `estimateGasFee`, `approveTarget`, and quote timestamp.
  3. If any route quotes, call `GET /swap` for the best (`isBest=true`) route. Record whether
     the response is `tx` (SWAP) or `rfq` (RFQ), and the exact shape of whichever is present.
  4. If `tx` is present: attempt `Simulate Transactions` on it. Record the raw result.
  5. If `rfq` is present: do **not** attempt to simulate `typedDataToSign` (it is not
     `evmTx`-shaped). Instead call `GET /approve-transaction?vendor=<rfq.vendor>` for the
     spend token and attempt `Simulate Transactions` on **that** calldata only. This is the
     empirical test of whether "simulate the approve leg" (a fallback floated in the original
     ingestion report) actually works.
  6. Record quote-to-quote drift: re-quote the same request after 35s (past the ~30s TTL) and
     record whether `quoteId` reuse in `/swap` fails with `QUOTE_EXPIRED` (40401) as documented,
     or behaves differently.
- Output: `reports/quote-feasibility.json` + rendered `.md`, same pattern as F001-A's
  `rwa-universe` report. Required fields:
  - Per-representation: execution mode, vendors seen, whether a route quoted at all, whether
    `/swap` succeeded, whether simulation was attempted and its raw pass/fail/error, quote TTL
    behavior observed.
  - Aggregate: % of sampled representations that quote successfully; breakdown of
    `executionMode` (expect 100% RFQ per the docs — this spec exists to confirm or refute
    that empirically); % where the approve leg alone simulates successfully; observed vendor
    distribution (`InchFusion`, `CowSwap`, `PcsXRfq` per docs — confirm live); any vendor or
    error code not in the documented set.
- Fail-closed per representation (one bad quote does not abort the whole run), same pattern
  as F001-A. The run's overall status is `COMPLETE`/`INCOMPLETE`/`FAILED` exactly as before.

### T4. Definition of "simulated" (Amendment, replaces blueprint section 6 Step 9 language where it conflicts)

- Do not write this definition speculatively. T3's actual results decide it. This task is:
  once T3 has run live, draft a short amendment stating precisely what "simulated before
  execution" means for an RFQ route on Orchard (e.g. "the approve leg is simulated; the RFQ
  settlement itself is bounded by wallet-level policy and vendor relayer behavior, not
  pre-broadcast simulation" — or whatever T3 actually shows). This becomes DEC-029 material,
  not something Claude Code decides unilaterally.

## 4. Hard rules

- No signing of anything. `userWalletAddress` is a read-only parameter these endpoints accept
  for quote construction — it never needs a matching private key for T1–T3's calls.
- No `POST /order/submit`. No broadcast. This spec cannot result in a real trade.
- No hardcoded vendor names, execution modes, or error codes as assumptions — every one must
  be confirmed against a live response before being treated as fact in the report or in code
  comments.
- Money math (amounts, prices, fees) stays in decimal.js / exact provider strings, same as
  F001-A. No floats.

## 5. Tests

- Trading API client: request building for `/quote`, `/swap`, `/approve-transaction`
  (parameter encoding, especially `amount` as smallest-unit integer strings and `vendor`
  passthrough); response schema parsing for both `tx` and `rfq` shapes; unknown-field
  reporting.
- Transaction API client: request/response schema for `Simulate Transactions`; error mapping
  consistent with the existing typed-error set from F001-A.
- Probe pipeline: fail-closed per-representation (one 404/quote-empty doesn't abort the run);
  TTL-expiry test (mocked); report renderer (JSON→MD, same discipline as F001-A: MD generated
  from JSON only).
- Fixture isolation and gitleaks regression tests extended to cover any new fixture files,
  same rules as F001-A (`SYNTHETIC_`/`DOC_EXAMPLE_` prefix, never imported from `src`).

## 6. Acceptance

- CI green (lint, typecheck, unit, integration — no live calls in CI, same as F001-A).
- Live acceptance (owner-run, T5-equivalent): the probe runs against real Binance data for
  at least the 40 multi-representation tickers, and the report answers, with live evidence:
  - Is `executionMode` really always RFQ for these tokens? (confirm/refute)
  - Does any route simulate successfully, and if so, which leg?
  - What is the real quote-to-quote drift and TTL behavior?
  - What vendors actually appear?

## 7. Stop conditions

- If `Simulate Transactions`' real request shape differs materially from what the Transaction
  API doc currently describes, stop and re-verify the doc before coding around a guess.
- If **zero** representations produce anything simulatable (not even the approve leg), that is
  a valid, important result — write it up as DEC-029 material, do not force a workaround.
- If the read-only probe address needs funds or approvals to even get a quote (should not,
  per docs, but confirm), stop and report — that changes DEC-028.

## 8. Non-goals

Signing, broadcasting, wallet integration, Agentic Wallet (that's F001-C), UI, any money
movement of any kind.

## 9. Open decisions

- **DEC-027**: approve this spec.
- **DEC-028**: the read-only probe wallet address. `GET /quote` documents `userWalletAddress`
  as required only for RFQ routes and used "as the receiver in the RFQ order" — it does not
  need to be a wallet the probe controls, since nothing is signed. Recommendation: use a
  well-known, funded public address (e.g. a major exchange hot wallet or a known BSC address
  with USDT balance) purely so any balance-dependent quote logic doesn't reject the request —
  **do not use the owner's real wallet address for this read-only probe.** Confirm live
  whether an arbitrary/zero-balance address works before deciding this is even needed.
- **DEC-029**: the "simulated" definition (T4) — decided from T3's live results, not now.

## 10. Completion report format

Same as F001-A: files changed | behavior implemented | tests run, exact results | blockers |
deviations | unverified claims. Never say "simulated" or "works" for anything not exercised
against the real provider.
