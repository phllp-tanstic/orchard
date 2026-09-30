# Feature 002: Deterministic Best Execution Engine (M2)

Status: APPROVED by owner (DEC-035, DEC-005, DEC-036 decided below). Builds on Feature 001-A and 001-B (both merged).
Read AGENTS.md, F001A-spec.md and F001B-spec.md first. Reuse their clients, evidence recorder,
schemas and report patterns. Do not fork them.

## 1. Goal

Given an underlying company and a USDT amount on BSC (chain 56), discover every eligible
tokenized representation, obtain a real executable quote for each, normalize the results to
comparable underlying shares, rank them deterministically, and persist why the winner won.

Read-only. No signing, no swap submission, no broadcast, no wallet. Uses /quote only.
Simulation (M3) and execution (M5) are out of scope.

## 2. Verified facts this spec relies on (from merged evidence, not assumption)

- USDT on BSC has 18 decimals. Amounts to /quote are smallest-unit integer strings.
- Live /quote routes observed so far: executionMode SWAP on 181/181, vendor LiquidMesh only.
  The docs claim RFQ for equities. The engine must treat executionMode and vendor as open
  strings and record them, never branch on an assumed value.
- /swap requires slippagePercent or autoSlippage although documented optional.
- Quote failures exist and are time-dependent: 40367 (non-trading session), 40374 (undocumented).
  Quote success was 81/96 and 61/96 an hour apart. Ineligibility is a normal outcome.
- Quote TTL is about 30s: a quoteId reused after 35s returns 40401.
- F001-A: tokenPrice / referencePrice equals tokenToShareRatio on /rwa/tokens, so one token
  represents tokenToShareRatio shares. The engine computes
  normalizedShares = toTokenAmount * tokenToShareRatio. Confirm this against a live quote for
  one 1:1 token and one non-1:1 token before relying on it, and record the confirmation.
- 40 tickers exist on both bStock and Ondo. 445 underlyings, 485 representations.

## 3. Scope

### T1. packages/execution: domain and normalization

- Types per blueprint section 6: CandidateRoute, RouteDecision, with exact decimal strings.
- Normalization in decimal.js only. No floats anywhere.
- Functions: normalizeShares, effectivePricePerShare, quoteAge, eligibility(candidate, policy).

### T2. Eligibility policy (configuration, never hardcoded)

- Hard rejections, each with a stable reason code: QUOTE_ERROR (carry provider code), NON_TRADING_SESSION,
  INVALID_RATIO, WRONG_CHAIN, UNSUPPORTED_TOKEN, QUOTE_STALE, PRICE_IMPACT_EXCEEDS_MAX,
  NULL_IDENTITY (the 3 excluded tokens), ASSET_TYPE_EXCLUDED (policy-driven).
- Policy fields: maxPriceImpactBps, maxQuoteAgeSeconds, allowedAssetTypes, spendAsset (USDT).
- allowedAssetTypes is a parameter, never hardcoded. Default per DEC-005: Stock and ETF.
  Every report and record carries the assetType. ETFs are never labelled as stocks.
- maxQuoteAgeSeconds default is 20 per DEC-036, cited in a comment with the evidence: the
  measured quote expiry is about 30s (quoteId reuse after 35s returned 40401, F001-B).

### T3. Ranking (deterministic, versioned)

1. Highest normalizedShares for the fixed spend.
2. Lower explicit fees (tradeFee plus estimateGasFee) where both candidates report them in the same unit.
3. Fresher quote.
4. Lower priceImpact.
5. Tie-break: lexicographic tokenContractAddress.

- algorithmVersion string on every RouteDecision. No weighted scores. No LLM.
- Property tests: ranking is invariant to input order; identical inputs give identical output.

### T4. Orchestrator and persistence

- run(ticker, spendAmount, policy): resolve representations from the RWA data the probe already
  fetches (reuse packages/rwa, no hardcoded tickers or addresses), quote each through the
  F001-B client with the configured read-only probe address (burn address, confirmed accepted),
  normalize, filter, rank.
- Quotes for one request are fetched concurrently within the rate limiter, and the orchestrator
  records each quote's own timestamp (freshness is per quote).
- Migration 008+: schema `execution`, tables execution_request, candidate_route, route_decision.
  Append-only with the same trigger, RLS and role grants as evidence.* (no exceptions, no UPDATE).
  Every candidate links to its evidence.provider_call.
- If zero candidates are eligible, the result is an explicit NO_ELIGIBLE_ROUTE decision listing
  every rejection reason. Never a fallback price, never a silent substitution.

### T5. tools/route-probe and report

- CLI: pnpm route:probe --ticker NVDA --amount 100 (amount in USDT, decimal).
- Output reports/route-probe.json and rendered .md (MD generated from JSON only): every candidate,
  its normalized shares, effective price per share, rejection reasons, the ranking, the winner
  and the reason codes.
- Batch mode over all 40 multi-representation tickers at one amount, summarizing how often the
  winner is bStock vs Ondo, the normalized-shares spread between them in bps, and how many
  tickers had fewer than 2 eligible candidates at run time.

## 4. Hard rules

- No signing, /swap, /order/submit, broadcast or wallet. Test asserts none are called.
- No hardcoded tickers, addresses, vendors, execution modes or asset types.
- Any claim about which platform is cheaper comes only from a stored live run.
- Fail closed: a provider error for one representation rejects that candidate, not the run.

## 5. Tests

- Normalization: many-decimal ratios, ratio 1, non-1 ratio, zero/invalid ratio rejected.
- Eligibility: every reason code has a test, including 40367 and 40374 as provider codes.
- Ranking: ordering, every tie-break level, order invariance, determinism.
- Orchestrator with a mocked client: one failing candidate does not abort, all-fail gives NO_ELIGIBLE_ROUTE.
- Integration (Postgres, per-file database as in DEC-017): append-only enforcement on execution.* tables.
- Fixture isolation and gitleaks regression rules apply to any new fixture.

## 6. Acceptance

- CI green (lint, format:check, typecheck, unit, integration, audit).
- Live (owner-run): route:probe on NVDA and on the full 40-ticker batch produces a report whose
  numbers reconcile with the stored provider_call rows, and at least 2 representations are
  quoted independently for at least one ticker. If market hours leave fewer than 2 eligible,
  the report says so honestly and the run is repeated when the market is open.

## 7. Stop conditions

- Live quotes show the normalization formula is wrong (the shares-per-token check in section 2
  fails): stop and report, do not adjust the formula to make results look right.
- /quote needs a funded address to quote at all for some tokens: stop and report.

## 8. Non-goals

Simulation, signing, wallet, Agentic Wallet, UI, amount adaptation (M6), share links (M7).

## 9. Decisions (all resolved)

- DEC-035: this spec is approved.
- DEC-005: asset types in scope are Stock and ETF, labelled by assetType. Engine takes it as config.
- DEC-036: maxQuoteAgeSeconds is 20.

## 10. Completion report format

Files changed | behavior implemented | tests run with exact results | blockers |
deviations | unverified claims. Never say "best execution" for anything not shown by a stored live run.
