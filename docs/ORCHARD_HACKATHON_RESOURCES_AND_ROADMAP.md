# Orchard — Hackathon Resources & Development Roadmap

**Hackathon:** BNB Hack: Tokenized Stocks Edition  
**Build window:** 16 Sep – 11 Oct 2026 (UTC)  
**Submission lock:** **11 Oct 2026, 12:00 UTC**  
**Current project start baseline:** 20 Sep 2026  
**Product:** Orchard

This file is the working resource map for development. Official documentation wins over this summary if a page changes.

---

# 1. Hackathon Contract

## Objective

Build a useful, working product or agent for tokenized stocks on BNB Smart Chain using the Binance/BNB developer stack.

## Hard Requirements

- At least one of **bStocks, Ondo, or xStocks** must be central.
- **Spot only.** Perpetuals are out.
- **BSC mainnet only** for the qualifying execution flow.
- Transaction API simulation should be used while building; the final demo should use small live amounts.
- Public repository required.
- Deployed link or judge-followable instructions required.
- Demo video <=4 minutes is strongly recommended.
- Developer Experience Report is required.
- Repo, demo, and deployed link must remain accessible through judging.

## Judging Weights

- **Technical implementation — 30%**
- **Creativity & originality — 25%**
- **Developer Experience Report — 25%**
- **Product quality & UX — 20%**

## Prize Structure

Main placements:

- 1st — $6,000
- 2nd — $4,000
- 3rd — $3,000
- 4th — $2,000
- 5th — $1,000

Special prizes:

- **Best Use of Agentic Wallet / Wallet Skills — $2,000**
- **Best Use of BNB Agent Studio — $2,000**

The same submission can win a main placement and a special prize.

---

# 2. Locked Orchard Thesis

**Orchard is a banking-style consumer investment account where users choose the company and amount they want, while Orchard adapts the order to their explicit limits and chooses the best supported tokenized-stock execution rail on BNB Chain.**

Primary line:

> **Buy the company. We choose the rail.**

Visible hierarchy:

1. Buy the company.
2. Orchard chooses the best supported rail.
3. Explicit user limits can adapt the amount.
4. Share or gift the exposure.

Technical heart:

`RWA discovery → normalization → live quotes → deterministic Best Execution → simulation → user confirmation → Agentic Wallet authority → BSC mainnet`

Persistent extension:

`bounded conditional intent → BNB Agent Studio → monitor/abstain → verified secure handoff → Agentic Wallet policy → execution`

---

# 3. Official Hackathon & Support Links

## Main Hackathon

- Overview / rules / prizes / dates:  
  https://www.bnbchain.org/en/hackathons/tokenized-stocks

- Submission form:  
  https://forms.gle/yToDUzaDMwWnq6R6A

- Developer Experience Report template:  
  https://forms.gle/EUQ39xf54GHjC2ys5

- Builder Telegram:  
  https://t.me/+MhiOLT0YUnlmNWFk

- BNB Chain Discord:  
  https://discord.gg/bnbchain

## Registration / Access

The supplied hackathon brief also includes this registration/API-access link. Verify its current state before relying on it:

- https://forms.gle/NEmy3FxYc4f5Dua47

- Binance Web3 developer portal / API key:  
  https://web3.binance.com/en/dev-portal

---

# 4. Binance Web3 API — Official Resources

## Start Here

- Introduction:  
  https://web3.binance.com/en/dev-docs/introduction

- Authentication & signing:  
  https://web3.binance.com/en/dev-docs/authentication

- Full REST catalog:  
  https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api

- LLM doc index:  
  https://web3.binance.com/en/dev-docs/llms.txt

- Full docs in one file:  
  https://web3.binance.com/en/dev-docs/llms-full.txt

## Modules Orchard Expects to Use

### RWA Data — CORE

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data

Use for:

- supported RWA issuance platforms;
- token list;
- underlying asset mapping;
- on-chain/reference price data;
- token/share ratio semantics;
- market status / next open;
- company/profile and attestation-related metadata where exposed.

Feature 001 begins here.

### General / Market Data — CORE SUPPORTING

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/general-data

Use where needed for:

- current market data;
- candles;
- token analytics;
- context for route/price quality.

### Trading API — CORE

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api

Use for:

- executable quotes;
- swaps / approvals;
- route output;
- cross-DEX aggregation where supported.

### Transaction API — CORE

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api

Use for:

- dry-run / simulation;
- transaction preparation/broadcast where supported;
- fail-before-spend behavior.

### Wallet API — CORE

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/wallet-api

Address portfolio:

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/address-portfolio

Use for:

- balances;
- positions;
- portfolio state;
- resulting position reconciliation.

### DeFi API — OPTIONAL / ONLY IF PRODUCT-RELEVANT

Data:

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/defi-data

Transactions:

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/defi-transaction

Do not add DeFi yield/LP merely for API count. Best Execution must remain the product center.

### b402 Payments — OPTIONAL

https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/b402-payments

Use only if Orchard/Agent Studio genuinely purchases a service or data/inference capability from another agent/service.

---

# 5. Agentic Wallet / Wallet Skills — Core Prize Target

## Official Docs

- Welcome / capabilities:  
  https://developers.binance.com/en/docs/products/agentic-wallet/welcome

- Install:  
  https://developers.binance.com/en/docs/products/agentic-wallet/quickstart/install-agentic-wallet

- Tokenized securities use case:  
  https://developers.binance.com/en/docs/products/agentic-wallet/use-cases/trading/stock-trading

- Skills reference:  
  https://developers.binance.com/en/docs/products/agentic-wallet/reference/skills

- Wallet Skills overview:  
  https://developers.binance.com/en/docs/products/wallet-skills/overview

- Binance Skills Hub:  
  https://github.com/binance/binance-skills-hub

- Install Agentic Wallet skill:  
  `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet`

## Current Official Capability Signal

As of the project baseline, official Agentic Wallet docs describe:

- QR authentication / sessions;
- wallet status/address/balance/history;
- daily quota and security settings;
- market swaps;
- limit orders;
- transfers;
- user-defined daily limits;
- tradable-token scope;
- high-risk transaction handling;
- BSC chain ID 56 support.

## Orchard Target

The special-prize story should be:

> Orchard decides what execution fits the user's intent; Agentic Wallet independently decides whether Orchard is authorized to execute it.

Minimum deep-use proof target:

1. real Orchard order reaches Agentic Wallet boundary;
2. supported live action succeeds;
3. wallet state/quota/security is observable where available;
4. deliberately disallowed action is rejected by Wallet policy where reproducible;
5. Orchard cannot bypass that rejection.

If the selected tokenized-stock route is not currently supported directly by Agentic Wallet, mark that exact integration GATED and use the deepest truthful supported Wallet capability rather than creating a disconnected fake demo.

---

# 6. BNB Agent Studio — Core Extension / Special-Prize Target

## Official Resources

- Product page / install / FAQ:  
  https://www.bnbchain.org/en/bnb-agent-studio

- BNB Agent Studio launch overview:  
  https://www.bnbchain.org/en/blog/bnb-agent-studio-is-live-on-bnb-chain-ai-agents-from-one-prompt

## Install

`npm install -g @bnbagent/studio-cli`

Then:

`bag skills install`

## Official Capability Signal

Current official material describes:

- managed autonomous cloud runtime;
- per-agent wallet;
- ERC-8004 on-chain identity;
- ERC-8183 task interface;
- x402 payment setup;
- optional self-funding / auto-refill for the agent's own bills;
- integrations with Claude Code / Cursor / MCP clients.

The hackathon page specifically awards the special prize for deep use of:

- agent identity;
- autonomous runtime;
- self-funding via x402.

## Orchard Target

Create **one bounded persistent Orchard agent**.

Its job:

> Keep a user-defined conditional investment intent alive after the browser closes.

The agent must not become a stock recommender.

Ideal proof:

1. Orchard user defines company, amount, execution constraints, and expiry.
2. The task is accepted by a Studio-deployed agent.
3. ERC-8004 identity is visible.
4. Browser closes; agent stays live.
5. Agent monitors current route conditions.
6. Agent demonstrably abstains when conditions are not satisfied.
7. Agent uses self-funding/x402 for its own supported costs where feasible.
8. Once conditions pass, it invokes only a **verified secure execution handoff**.
9. Agentic Wallet remains the user's independent wallet-level authority.

### Important Gate

Do not assume Agent Studio can directly control a user's Agentic Wallet. Verify the exact authentication/session/tool boundary first.

If direct secure execution interoperability is unavailable, the production-safe fallback is:

`persistent monitor → condition matched → prepare/stage → notify user / require secure wallet confirmation`

This still proves a meaningful persistent agent without misrepresenting custody or authority.

---

# 7. BNB Chain / Execution Resources

- BNB Chain docs:  
  https://docs.bnbchain.org

- Developer tools:  
  https://www.bnbchain.org/en/dev-tools

- BscTrace:  
  https://bsctrace.com

- PancakeSwap:  
  https://pancakeswap.finance

BSC mainnet chain ID:

`56`

---

# 8. Orchard Development Roadmap

The deadline is fixed. The schedule below prioritizes proof in dependency order rather than front-loading UI.

## Phase 0 — 20–21 Sep: Bootstrap + Access + Evidence System

### Goals

- create repository;
- add `AGENTS.md` and `CLAUDE.md` referencing canonical `hackathon-skills`;
- add product/blueprint/decision/milestone/evidence/DevEx docs;
- establish CI;
- obtain Binance Web3 API access;
- begin DevEx timer/log;
- install required Binance/BNB skills only after reading their official setup docs.

### Exit Gate

- repo initialized;
- CI green on scaffold;
- API key stored safely;
- first signed read-only API call attempted and logged;
- no secrets committed.

---

## Phase 1 — 21–23 Sep: Feature 001 — Live RWA Universe

### Build

- signed Binance client;
- platform enumeration;
- BSC RWA token enumeration;
- raw evidence retention;
- normalized token model;
- explicit underlying grouping;
- token/share ratio validation;
- overlap matrix.

### Questions to Resolve

- Which issuance platforms actually appear?
- How many unique underlying equities?
- How many have >1 representation?
- Is cross-wrapper routing a real enough phenomenon for the headline demo?

### Exit Gate

A machine-readable universe/overlap report built from live data.

If overlap is weak, update blueprint immediately rather than hardcoding a preferred demo set.

---

## Phase 2 — 23–25 Sep: Quotes + Normalization + Simulation

### Build

- Trading API quote client;
- fixed-spend candidate generation;
- arbitrary-precision token/share normalization;
- deterministic effective-cost ranking;
- quote freshness;
- eligibility reasons;
- Transaction API simulation;
- rerank/fail-closed behavior.

### Exit Gate

For at least one live target:

`underlying → representation(s) → executable quote(s) → normalized result → selected route → simulation`

No transaction yet required.

---

## Phase 3 — 25–28 Sep: Core Consumer Buy + Mainnet Proof

### Build

- banking-style shell;
- stock search/detail;
- amount flow;
- lightweight execution profile;
- amount adaptation explanation;
- Best Execution preview;
- "Why this route?" disclosure;
- wallet/session path;
- small-value BSC mainnet execution;
- receipt/reconciliation.

### Exit Gate

A first-time user can execute a small live tokenized-stock purchase without choosing a wrapper/DEX manually.

This is the minimum viable qualifying Orchard product.

---

## Phase 4 — 28 Sep–1 Oct: Agentic Wallet Deep Integration

### Build / Verify

- authenticated Agentic Wallet session;
- wallet/balance/quota/security state where available;
- connect real Orchard execution boundary;
- supported transaction/market operation;
- real wallet-policy rejection path;
- capability flags for unsupported functions.

### Exit Gate

Agentic Wallet is visibly part of Orchard's real control path, not a separate demo.

---

## Phase 5 — 1–3 Oct: Portfolio + Share-to-Buy

### Build

- portfolio view grouped by underlying company;
- execution profile settings;
- ShareIntent model;
- public share URL;
- recipient adaptation using recipient portfolio/limits;
- fresh quote/route at recipient execution time;
- provenance from shared idea to recipient execution.

### Demo Principle

**Share the idea, not the trade.**

### Exit Gate

Two users can see the same shared investment idea and receive different permitted execution sizes based on their explicit constraints, while route/quote state is always recomputed fresh.

---

## Phase 6 — 3–5 Oct: Gift Feasibility + Verified Gift Path

### Investigate First

- transferability of chosen tokenized assets;
- recipient eligibility requirements;
- issuer restrictions;
- Agentic Wallet transfer/addressbook constraints;
- direct asset transfer vs funded claim;
- custody/escrow implications;
- expiry/refund safety.

### Decision

Choose one:

- `DIRECT_ASSET`
- `FUNDED_CLAIM`
- `SHARE_ONLY_FOR_MVP`

### Rule

Do not build a pretty gift flow until the settlement model is proven.

---

## Phase 7 — 4–7 Oct: BNB Agent Studio Persistent Intent

Can run partly in parallel with Gift work once core Buy is stable.

### Build

- install Studio/skills from official docs;
- define a narrow conditional-intent task schema;
- deploy one persistent Orchard agent;
- capture ERC-8004 identity;
- prove runtime continues independently of browser;
- implement condition checks + abstention + expiry;
- verify x402/self-funding path for agent's own supported costs;
- test secure execution handoff boundary.

### Exit Gate

A real persistent agent solves the "intent outlives the browser" problem and is not an arbitrary AI trader.

---

## Phase 8 — 6–8 Oct: Public Production Deployment

### Build

- public web deployment;
- managed database;
- production secrets;
- health/capabilities endpoint;
- structured logs;
- rate limits;
- error monitoring;
- database migration checks;
- rollback path;
- external smoke tests.

### Exit Gate

A judge can use Orchard without local setup.

---

## Phase 9 — 8–9 Oct: Blueprint Audit + Hardening

Run canonical `blueprint-audit` skill.

Audit:

- repo vs blueprint;
- live vs mocked paths;
- sponsor integration depth;
- negative paths;
- security invariants;
- deployment truth;
- gift claims;
- Agentic Wallet claims;
- Agent Studio claims;
- DevEx evidence completeness.

Fix P0/P1 findings before submission work.

---

## Phase 10 — 9–10 Oct: Evidence Audit + Demo + DevEx Report

Run canonical `evidence-audit` skill.

Finalize:

- material claim ledger;
- mainnet tx evidence;
- wallet-policy rejection;
- deployment evidence;
- Agent Studio identity/runtime evidence;
- exact known gates;
- README;
- judge instructions;
- <=4 minute demo video;
- Developer Experience Report.

No marketing claim survives without proof.

---

## Phase 11 — 11 Oct: Submission Lock

### Target

Submit **before** the official 12:00 UTC lock, with buffer.

Checklist:

- public repo accessible;
- deployed app accessible;
- demo accessible;
- DevEx report submitted;
- final form complete;
- all links externally tested;
- no secrets in repo;
- final commit tagged/recorded;
- submission claim ledger frozen.

---

# 9. Product Scope Guard

## Must Ship

- live RWA discovery;
- deterministic Best Execution;
- simulation;
- small BSC mainnet purchase;
- banking-style UX;
- portfolio-aware lightweight amount adaptation;
- portfolio view;
- Share-to-Buy;
- public deployment;
- DevEx report;
- deep Agentic Wallet use or an explicit evidence-backed gate.

## Strong Target

- verified gifting path;
- Agentic Wallet rejection demo;
- one BNB Agent Studio persistent conditional-intent agent with identity/runtime evidence.

## Do Not Add Unless Core Is Stable

- social feed;
- influencers/followers;
- arbitrary crypto trading;
- full wealth management;
- automatic portfolio optimization;
- thematic baskets;
- DeFi yield optimizer;
- multi-chain execution;
- agent marketplace;
- agent-to-agent network complexity.

---

# 10. Initial Technical Research Questions

Feature 001 should answer these before architecture hardens:

1. What exact Binance RWA response field identifies the underlying ticker/company?
2. What is the exact token/share ratio semantic and unit?
3. Which BSC representations currently map to the same underlying?
4. Which can be quoted by Trading API?
5. Does Trading API quote the same spend asset across platforms?
6. How are approval steps represented?
7. How fresh are quote responses and are expiries explicit?
8. Which Transaction API call gives the strongest dry-run proof?
9. Which tokenized-stock operations are supported directly by Agentic Wallet today?
10. Can Agentic Wallet security/quota state be read through the installed tools/API?
11. Can a deterministic policy rejection be triggered safely for demo?
12. What exact Agent Studio primitive should hold Orchard's conditional-intent state?
13. Can Studio securely invoke a user Agentic Wallet session, or must it stage/notify?
14. Which Studio self-funding/x402 behavior can be demonstrated without conflating the agent wallet with user investment funds?
15. Are direct transfers of the chosen stock token permitted and usable for gifting?

Record answers with source + date + evidence. Unknown is an acceptable state; assumption is not.

---

# 11. Final Product Success Test

A judge should understand Orchard in under 15 seconds:

> **I choose NVIDIA and $25. Orchard checks what fits my limits, compares the supported tokenized-stock routes, simulates the best one, and executes through my wallet controls on BNB Chain. I can also share the investment idea or send exposure to someone else without making them understand token wrappers.**

The technical review should then reveal substantial depth beneath that simple interaction.
