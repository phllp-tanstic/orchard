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

## 11. Amendment A1 - the per-share benchmark (supersedes section 2 where it conflicts)

Status: APPROVED by the owner. Added after the section 2 confirmation was run.

### What was wrong

Section 2 says "tokenPrice / referencePrice equals tokenToShareRatio on /rwa/tokens, so one
token represents tokenToShareRatio shares". The arithmetic is correct and the conclusion is
correct. What section 2 does not say, and what a first pass got wrong, is **which field is the
per-share price**. Checking the formula against `/rwa/tokens` `referencePrice` makes it look
wrong by exactly a factor of `tokenToShareRatio`.

### The rule

Per Binance's tokenized-securities concept **"Token != Share"**: one token represents
`tokenToShareRatio` (the shares multiplier) shares, and
`referencePrice = tokenInfo.price / sharesMultiplier`.

- **`/rwa/price` `referencePrice` is the per-underlying-share price.** It is the only
  per-share field, and it is the benchmark any normalization check must use.
- **`/rwa/tokens` `referencePrice` is a per-TOKEN price. It is NOT per-share.**
- **`/rwa/tokens` `tokenPrice` is NOT per-share either** - it is the per-token price scaled up
  again by `tokenToShareRatio`.
- `/rwa/price` `tokenPrice` equals `/rwa/tokens` `referencePrice`: both are per-token.

So, writing `T` for the per-token price and `R` for `tokenToShareRatio`:

| Field                          | Quantity                |
| ------------------------------ | ----------------------- |
| `/rwa/tokens` `tokenPrice`     | `R x T`                 |
| `/rwa/tokens` `referencePrice` | `T` (per token)         |
| `/rwa/price` `tokenPrice`      | `T` (per token)         |
| `/rwa/price` `referencePrice`  | `T / R` (**per share**) |

### The formula, confirmed

```
normalizedShares      = (toTokenAmount / 10^decimals) * tokenToShareRatio
impliedPricePerShare  = spendAmount / normalizedShares
```

The `10^decimals` step is the unit conversion from the provider's smallest-unit integer
string to whole tokens; `decimals` is taken from the quote's own echoed `toToken.decimal`,
falling back to the token list. Section 2 states the formula in token units and omits this
step; it is required, not a deviation.

### Evidence

One short window, 2026-10-02T12:57:34.859Z to 12:57:58.501Z (23.6s), spend 100 USDT,
`probe_run b44704bc-7870-474b-9c66-4688b6cbb9c1`. Population at that moment: 485 usable
representations, of which **9 with ratio >= 2** and **2 with ratio <= 0.5**; 228 at ratio
exactly 1 and 122 in [1.005, 1.03]. Sampled all 11 far-from-1 tokens plus 5 at ratio 1 and 5
near 1; 19 of 21 produced a quote.

`impliedPricePerShare` deviation from `/rwa/price` `referencePrice`:

| Group            | Evaluated | Worst abs deviation | Outside +/-300 bps |
| ---------------- | --------- | ------------------- | ------------------ |
| ratio >= 2       | 9         | **51.4 bps**        | **0**              |
| ratio <= 0.5     | 1         | 7.7 bps             | 0                  |
| ratio == 1       | 5         | 32.5 bps            | 0                  |
| ratio 1.005-1.03 | 4         | 22.3 bps            | 0                  |

The criterion (ratio >= 2 within +/-300 bps) **passes**, with the worst case 6x inside it.
Largest-ratio cases: `PPLTon` ratio 10 at 13.6 bps, `NFLXon` ratio 10 at 5.7 bps, `KLACon`
ratio 10.026064925604903975 at 27.2 bps.

Two selected tokens produced no quote and are listed rather than hidden - both are documented
normal outcomes, not formula failures:

| Token         | Ratio              | Provider code                  |
| ------------- | ------------------ | ------------------------------ |
| ondo `ENLVon` | 0.066667           | `40367` non-trading session    |
| ondo `ORCLon` | 1.0079328914586566 | `40374` insufficient liquidity |

### Carried risk, not resolved by this amendment

The provider's "share" unit is the provider's own. It is not established that one provider
share equals one exchange-listed share: for `PPLTon` the per-share benchmark is 15.71 while
the real-world PPLT ETF trades near 155. That does not affect this spec, which compares
representations **of the same underlying** against each other. It does mean a cross-platform
comparison is only valid if both platforms use the same share unit for the same ticker, so
T5's batch report records the per-share benchmark agreement between bStock and Ondo in bps
rather than assuming it.
