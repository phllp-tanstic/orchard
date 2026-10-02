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

## 12. Amendment A2 - the provider share unit, and the DEC-037 deviation gate

Status: APPROVED by the owner (DEC-037). Appended rather than editing A1.

### A1's carried risk is retracted

A1 closed with a carried risk: that a provider "share" might not equal an exchange-listed
share, citing a PPLTon per-share benchmark of 15.71 against "a real-world PPLT near 155".
**That comparison was stale and the risk is withdrawn.**

PPLT underwent a **10-for-1 forward share split** in May 2026 - announced 2026-04-22, record
date 2026-05-14, post-split trading from 2026-05-18, NAV per share 178.62 before and 17.86
after (SEC EDGAR, abrdn Platinum ETF Trust, CIK 0001460235, Form 8-K). Owner-supplied
third-party pages (digrin.com, funetf.co.kr) agree: about 179.80 in April 2026 and about
14.59 on 2026-07-29.

So a post-split PPLT share is in the mid-teens and the observed benchmark of 15.709643 is
**consistent** with the exchange-listed price. The apparent factor of 10 was the split ratio
itself, mistaken for a units problem.

**Evidence level, stated plainly:** the split and its NAV figures come from primary SEC
filings. The price context runs through late July 2026 from third-party pages. **No same-time
quote was taken**, so "the benchmark matched the listed price at 2026-10-02T12:57Z" is
consistent and unrefuted, not measured.

Cross-platform comparability remains **measured, not assumed**: T5's batch reports the
bStock-vs-Ondo per-share benchmark agreement in bps, observed within 49.6 bps across the 40
multi-representation tickers.

### DEC-037: a reference-deviation gate

A1 left a real gap: a route could be wildly mispriced yet eligible, and where it was the only
candidate it would be selected. That gap is now closed by policy rather than left open.

- `policy.maxReferenceDeviationBps`, default **"500"** (DEC-038, raised from the 300 bps
  this amendment originally set), applied in **both** directions.
- `REFERENCE_PREMIUM_EXCEEDS_MAX` - implied per-share price above the `/rwa/price`
  referencePrice benchmark by more than the max. Overpaying against the provider's own mark.
- `REFERENCE_DISCOUNT_SUSPECT` - below it by more than the max. Treated as suspect, not as a
  bargain: on a thin RWA route a deep discount more likely means a broken quote, a stale
  benchmark or a mispriced pool than free money.
- A deviation **exactly at** the max is allowed; the limit is inclusive.
- **Missing benchmark:** the candidate stays **eligible** and is flagged
  `REFERENCE_UNAVAILABLE` in the report and persisted as
  `candidate_route.reference_unavailable`. It is **never** treated as zero deviation - an
  absence of evidence is not evidence of a good price.

The ceiling is a **product default, not a measured provider limit**. The evidence, from two
live runs of the same 40 multi-representation tickers:

| Run                                    | Worst ELIGIBLE deviation | Median   |
| -------------------------------------- | ------------------------ | -------- |
| `eace2297-c3a1-44d7-bf60-14a279f3ebef` | 91.3 bps                 | 18.1 bps |
| `5dc1bdae-36fc-4c7b-b91e-0b5d863202e7` | **220.6 bps**            | 13.8 bps |

The two platforms also agreed on the benchmark itself to within **49.6 bps**.

**DEC-038 raises the default from 300 bps to 500 bps.** At 300, the 220.6 bps observation left
only about **1.4x** headroom - close enough that an ordinary market move could reject a
legitimate route. 500 bps gives about **2.3x** against the worst healthy observation so far.

Widening it costs no detection power, because the two populations are separated by orders of
magnitude rather than by a few hundred bps: the broken routes lost **81% to 100%** of value and
sat **thousands** of bps from their benchmark - 81149 bps, and up to 3.0e10 bps on the worst.

500 bps remains a product default and remains **the first number to revisit if a legitimate
route is ever rejected**.

`maxPriceImpactBps` is now evidence-backed too: healthy live routes reported 0 to about 107
bps, while four broken routes reported **93% to 99.96% impact** (9319-9996 bps). A 300 bps
ceiling sits far above every healthy observation and far below every broken one.
