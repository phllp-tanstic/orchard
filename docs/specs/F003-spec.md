# Feature 003: Read-only Consumer Web App (M4)

Status: APPROVED (DEC-039, DEC-040). DEC-041 hosting provider and region is recommended below and awaits owner confirmation; T0 and T5 are gated on it. Builds on Feature 001-A, 001-B and 002
(all merged). Read AGENTS.md, the three earlier specs and docs/HANDOVER.md first. Reuse the existing
clients, evidence recorder, engine and report patterns. Do not fork them.

## 1. Goal

A public, banking-style web app where a visitor searches a company, enters a USDT amount, and sees what
Orchard's engine found: the best supported execution, why it won, what was rejected and why, and how fresh
the quote is. Read-only. No wallet, no sign-in, no buy, no transaction. The confirm step is visibly not live
and says so, driven by a truthful capabilities endpoint.

This is blueprint M4 plus the BFF pieces it needs. It makes the thesis visible to a judge in under 15 seconds
without claiming anything that is not verified.

## 2. Facts this spec relies on

Verified live or in merged code:
- F002 engine: runBestExecution ranks eligible candidates deterministically and persists execution_request,
  candidate_route and route_decision (append-only). Defaults: maxQuoteAge 20s, maxPriceImpact 300 bps,
  maxReferenceDeviation 500 bps, asset types Stock and ETF.
- Live NVDA at 100 USDT: two representations quoted independently, SWAP mode via LiquidMesh.
- Eligibility depends on market hours (NON_TRADING_SESSION 40367, thin liquidity 40374). "No eligible route"
  is a normal outcome and must be shown honestly.
- Quote expiry is about 30s. Provider limits: 5 requests/s per endpoint and 1200 per 60s, per key and per IP.
- Provider reference-price fields are per-token on /rwa/tokens and per-share on /rwa/price (Amendment A1).

Documented, not yet proven from this project's own infrastructure:
- web3.binance.com/en/dev-docs/web3-api-prohibited-regions (last modified 2026-10-01): IP checks run on the
  API server side. Prohibited: US and its territories, CA, NL, GB, IR, CU, KP, Crimea, DPR, LPR, and JP
  conditionally. Both client IP and server location are checked. Whether the app's egress IP geolocates
  where its hosting region says is UNKNOWN until measured from the deployed host.

## 3. Scope

### T0. Hosting feasibility spike (owner-run deploy, gated on DEC-041)
- A minimal service in the chosen provider and region exposing GET /api/health. It makes one signed, read-only
  /rwa/platforms call and reports status, provider code, latency and the egress IP's country as seen by an
  independent IP-geolocation lookup. Acceptance: a code 0 response from the deployed host.
- If the provider returns a region or auth block, stop and report. Do not build further on that host.
- The Binance key lives only in the host's secret store. Never in the repo, the image, or client code.

### T1. apps/web scaffold
- Framework per DEC-040. TypeScript strict, pnpm workspace, lint, format, typecheck and tests in CI.
- Server-only environment validation at boot (zod). Missing or malformed config fails closed.
- A build-time test that scans the client bundle for the Binance key and secret names and values, and for
  contract-signing code. Any hit fails CI.
- Security headers, a strict content-security policy, same-origin only, request size limits.

### T2. BFF API (server side only)
- GET /api/health: database reachability, provider reachability, universe freshness.
- GET /api/capabilities: truthful flags computed at runtime. rwaDiscovery, liveQuotes, bestExecution true only
  when verified in this process; transactionSimulation, mainnetExecution, agenticWallet, shareIntent,
  fundedGifting false. The UI reads these and never hardcodes a feature as live.
- GET /api/assets?q=: search over the stored universe snapshot (T3), by ticker and company name.
- GET /api/assets/[ticker]: one underlying with asset type (Stock or ETF), market status, and how many
  supported representations exist.
- POST /api/previews {ticker, amount}: validate server-side, call runBestExecution with the default policy,
  return a UI-safe result: outcome, winner summary, estimated shares, estimated price per share, fees,
  quote timestamps, expiresAt, every candidate with its rejection reasons mapped to plain language, and the
  raw reason codes. Never return secrets. No raw signing data exists in this feature.
- Validation: ticker format, amount a plain decimal within configured min and max (product defaults 5 and
  1000 USDT, labelled as such). Reject everything else with a typed error.
- Protection: per-IP rate limit; single-flight coalescing of identical concurrent requests; a process-wide
  concurrency budget so public traffic cannot exhaust the provider limits; a result is never served after
  its oldest quote exceeds maxQuoteAge, it is recomputed. When the budget is exhausted return an honest
  "busy" state, never a stale or invented result.
- Errors map to honest states: no eligible route (with reasons), market closed, provider unavailable,
  invalid input. Nothing falls back to a guessed price.

### T3. Universe snapshot for search
- Search reads the latest COMPLETE run's stored snapshot (rwa.* tables), not live provider calls per request.
- pnpm universe:refresh reuses the F001-A pipeline (platforms, tokens, price). It does not duplicate it.
- Before building, confirm the stored snapshot holds ticker, underlying name, asset type, market status,
  platform and contract. If a needed field is missing, stop and report; do not add guesses.
- Add a migration only for a read-only view or index. Append-only rules stay.
- The API reports snapshot age. Beyond the configured max age (default 6 hours, a product default) the UI
  shows a stale-data banner.

### T4. UI
- Pages: home, explore, stock detail, amount entry, preview. Mobile first, responsive, accessible basics.
- Banking-style default language: company, amount, estimated shares, fees, quote age. No contract address,
  DEX name, wrapper selector or slippage form in the default view.
- "Why this route?" drawer: candidates with platform name, normalized shares, deviation from benchmark,
  price impact, quote age, accepted or rejected with reasons. Platform names (Ondo, bStock) appear only here.
- Preview shows a live countdown to expiry and a Refresh action that requotes.
- Honest states: no eligible route ("no transaction was submitted"), market closed, busy, provider
  unavailable, stale universe.
- Confirm is disabled and labelled "Execution is not live yet", driven by capabilities.
- Persistent plain notice: estimates only, not advice, price and size not guaranteed, tokenized securities
  may be restricted in some jurisdictions and Orchard does not yet verify eligibility.
- Initials avatars. No third-party image hosts, fonts or scripts in this feature.

### T5. Public preview deployment (gated on T0 and DEC-041)
- Deploy to the chosen host. Acceptance is external: a fresh browser, no local setup, health shows provider
  reachable from the deployed egress, capabilities truthful.

## 4. Hard rules

- No signing, wallet, /swap, order submission or broadcast anywhere. Extend the existing source-level test
  to cover apps/web.
- No secrets in the client, the repo, logs or error messages.
- No hardcoded tickers, addresses, platforms, vendors or prices in any runtime path. Test fixtures only in
  test/fixtures with the SYNTHETIC_ or DOC_EXAMPLE_ prefix.
- Money and ratio math stays in decimal.js. The UI formats provider strings, it does not recompute with floats.
- Nothing is labelled "best price", "cheapest", "guaranteed" or "live trading". Allowed wording: "we compare
  supported eligible routes".
- No analytics, trackers or third-party calls from the browser.
- Run exactly ONE server instance. The provider call limit is per key and the limiter is in-process, so
  scaling out requires a shared limiter first, which is a separate decision.

## 5. Tests

- DTO mapping: every rejection code to plain language, with the raw code retained.
- Validation, rate limiter, single-flight, concurrency budget, freshness cut-off.
- API route tests with the engine mocked at its boundary (clearly test-only).
- Component tests for each honest state and for capabilities-driven disabling.
- End-to-end browser test: search, amount, preview, open the drawer, a no-route state, the busy state.
- Bundle scan for secrets. Source scan for forbidden endpoints.
- Accessibility smoke checks and a mobile viewport check.
- Fixture isolation and gitleaks regression extended to new files.

## 6. Acceptance

- CI green (format, lint, typecheck, unit, integration, e2e, audit).
- Owner-run live check locally: searching NVDA and previewing 100 USDT shows the same winner and the same
  numbers as route:probe for the same moment, and the persisted execution_request reconciles with the screen.
- When the market is closed the app says so and submits nothing.
- T0 and T5 evidence: provider code 0 from the deployed host, and a public URL that a fresh browser can use.

## 7. Stop conditions

- The deployed region receives a region or auth block from the provider: stop, report, no workaround.
- A preview cannot complete inside the host's request limits: report before redesigning.
- The stored snapshot lacks fields search needs: report.

## 8. Non-goals

Wallet connect, sign-in or accounts, execution, simulation, share links (M7), gifting, portfolio and amount
adaptation (M6), Agent Studio, localisation, analytics.

## 9. Decisions

- DEC-039: approved.
- DEC-040: approved. Next.js with TypeScript, run as a standalone Node server (not serverless).
- DEC-041 (recommended, owner to confirm): Render, Frankfurt, a paid always-on instance. Fallback: Railway,
  Singapore. Checked against the provider docs on the day of writing:
  - Render regions: Oregon, Ohio, Virginia, Frankfurt, Singapore (render.com/docs/regions). Only Frankfurt
    and Singapore are outside the prohibited list. Render free instances sleep after inactivity.
  - Railway regions: California, Virginia, Amsterdam, Singapore (docs.railway.com/reference/regions). Only
    Singapore is outside the prohibited list.
  - Cloudflare Workers run in the data center nearest each request by default, so egress location is not
    controlled. Not suitable as the host. Optional later as a DNS and protection layer in front of the server.
  - UNVERIFIED: whether the provider accepts calls from either host's IP range. T0 measures it.
- Defaults stated for owner veto, not asked: anonymous access only, initials avatars, amount bounds 5 to 1000
  USDT, snapshot max age 6 hours, jurisdiction notice without geo-gating (gating is decided before execution).

## 10. Completion report format

Files changed | behavior implemented | tests run with exact results | blockers | deviations |
unverified claims. Never say "live", "deployed" or "works" without the evidence that word implies.
