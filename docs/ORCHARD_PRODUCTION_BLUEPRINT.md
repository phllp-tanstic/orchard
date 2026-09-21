# Orchard — Production Development Blueprint

**Status:** Product thesis locked; greenfield bootstrap blueprint  
**Hackathon:** BNB Hack: Tokenized Stocks Edition  
**Track:** Main Track — Tokenized Stocks Products & Agents  
**Chain:** BNB Smart Chain mainnet  
**Product / brand:** Orchard  
**Blueprint version:** 1.0.0 — LOCKED PRODUCT BASELINE  
**Locked:** 2026-09-20  
**Canonical methodology:** `phllp-tanstic/hackathon-skills`

---

## 0. Bootstrap Report

### Project Identity

Orchard is a greenfield hackathon project for the BNB Hack: Tokenized Stocks Edition. The required product domain is tokenized stocks on BNB Smart Chain, with at least one of bStocks, Ondo, or xStocks central to the submission. The build is spot-only and must demonstrate a working BSC mainnet flow.

The product should be publicly deployable and usable as a consumer-facing web application rather than a crypto-native trading terminal.


### Locked Brand

**Name:** Orchard  
**Primary line:** **Buy the company. We choose the rail.**  
**Share principle:** **Share the idea, not the trade.**  
**Gift principle:** **Send the company, not the token.**

Orchard is the consumer-facing brand. Do not rename the project or expose an infrastructure-first name in the main UX without an explicit product decision.

### Product State

**THESIS: APPROVED / LOCKED**

Orchard combines:

1. a consumer-friendly stock account that looks and behaves like a familiar banking/investing app;
2. a tokenized-equity Best Execution engine that hides issuer, wrapper, DEX, quote, and routing complexity;
3. a plain-English purchase flow such as **“Buy $25 of NVIDIA”**;
4. a shareable investment-intent flow;
5. a gifting/claim onboarding flow whose exact settlement mechanism is gated until live transfer/issuer constraints are verified.

### Canonical Product Sentence

> **We help non-crypto-native investors buy, share, and gift tokenized stock exposure without choosing token wrappers, issuers, DEXs, or blockchain execution routes themselves.**

### Core Claim

> **Users choose the company and amount; the system discovers, compares, simulates, and executes the best supported tokenized-stock route available on BNB Chain.**

### Product Philosophy

> **Buy the company. We choose the rail.**

Social/gifting companion:

> **Send the company, not the token.**

### Product Hierarchy

The product must remain easy to explain. Its visible hierarchy is:

1. **Buy the company** — the user chooses the underlying and amount.
2. **We choose the rail** — Best Execution selects the best supported eligible route.
3. **Your limits can adapt the amount** — a lightweight deterministic guardrail adjusts only when the user's explicit limits require it.
4. **Share or gift the exposure** — social onboarding reuses the same execution engine.

Portfolio-aware adaptation is **not** a separate wealth-management product. It must not become a risk questionnaire, portfolio optimizer, advisory engine, or rebalancing system.

### Canonical Lifecycle

`PROJECT BOOTSTRAP → BUILD-RIGHT → PRODUCTION BLUEPRINT → SPEC-DRIVEN BUILD → BLUEPRINT AUDIT → EVIDENCE AUDIT → SUBMISSION`

The active skill after this blueprint is accepted is:

`skills/spec-driven-build/SKILL.md`

### Known Gates

- Binance Web3 API key and hackathon access.
- Live enumeration of bStocks / Ondo / xStocks available through the RWA API.
- Real overlap between tokenized representations for the same underlying.
- Real executable liquidity for overlapping representations.
- Trading API quote support for target assets/routes.
- Transaction API simulation support for the chosen flows.
- Agentic Wallet setup and supported transaction semantics for tokenized-stock routes.
- Recipient/transfer/issuer restrictions affecting stock gifting.
- Mainnet funds for small-value live demo transactions.
- Public deployment and secret-management environment.
- Any geographic/eligibility restrictions affecting end users of specific tokenized securities.

### Immediate Highest-Leverage Step

**Build the live universe/route feasibility probe before building UI.**

The first engineering artifact must answer, from live BSC/Binance data:

1. Which tokenized equities are currently discoverable?
2. Which have multiple representations of the same underlying?
3. Which have executable routes through the Trading API?
4. What are the real normalized quote differences after token/share ratios and slippage?
5. Which routes successfully simulate?
6. Which can be executed through Agentic Wallet or the selected wallet path?
7. Which assets can be safely transferred/gifted, and under what restrictions?

If the multi-representation overlap is too weak, the product must preserve the consumer account and intent abstraction while degrading Best Execution from **cross-representation routing** to **best executable route for the supported representation**. The product must not fabricate route competition.

---

# 1. Product Thesis

## Product

Orchard is a consumer execution account for tokenized stocks on BNB Chain.

The user interacts with companies and investment amounts, not with token wrappers or DEX infrastructure.

Examples:

- `Buy $25 of NVIDIA`
- `Buy $10 of Apple`
- `Share this NVIDIA idea`
- `Gift $25 of NVIDIA`
- `Claim your gift`

Underneath that simple interface, the platform resolves the underlying equity, discovers supported tokenized representations, normalizes their economics, gets executable quotes, simulates candidate transactions, applies user/wallet policy, and executes the best eligible route.

## One-Line Thesis

**Orchard is a banking-style investment account where users choose the company and amount they want while Orchard adapts the order to their explicit limits and chooses the best supported tokenized execution rail on BNB Chain.**

Supporting intelligence may adapt the requested amount to the user's explicit execution limits before routing. This remains a guardrail, not the primary product.

## Primary User

Primary:

- a consumer who understands buying stocks but does not want to understand token wrappers, contract addresses, DEX routing, gas, slippage settings, or issuer fragmentation.

Secondary:

- existing on-chain users who want better execution across tokenized-equity representations;
- friends, family, creators, communities, or educators who want to share an investment idea or gift small stock exposure.

## Core Problem

Tokenized-equity infrastructure exposes implementation details that should not be user decisions:

- multiple representations of the same underlying company;
- different issuers/platforms;
- different token-to-share ratios;
- different on-chain prices;
- different liquidity and slippage;
- different executable routes;
- underlying reference-price differences;
- different market states and operational constraints.

A consumer who wants **NVIDIA** should not need to decide which NVIDIA wrapper, pool, or issuer to use.

The fragmentation becomes even more problematic for onboarding: gifting someone a token wrapper is much less understandable than gifting them **$25 of NVIDIA exposure**.

## Why Now

The hackathon itself is built around the gap between fast-growing tokenized equities and immature user/tooling layers. Binance's RWA API now exposes tokenized-stock metadata, underlying/reference information, platform identity, token-to-share ratio, market status, and BSC token contracts. Binance also exposes quote/execution, transaction simulation, wallet state, and an Agentic Wallet capable of constrained execution.

The product opportunity is therefore no longer merely "put stocks on-chain." It is to abstract the increasingly fragmented execution surface into a consumer action.

## Build-Right Gate Result

**PASS, subject to live route feasibility.**

The concept is sufficiently specific because:

- the target user is identifiable;
- the job is clear;
- the pain is specific;
- the Binance/BNB stack is structurally necessary;
- the MVP can be demonstrated end to end;
- differentiation is not "AI stock trading" but best-execution abstraction plus intent-based onboarding;
- gifting and sharing strengthen onboarding without replacing the core execution claim.

---

# 2. Hackathon Fit

## Required Constraints

The implementation must satisfy:

- tokenized stocks on BSC;
- at least one of bStocks, Ondo, or xStocks central to the product;
- spot only;
- BSC mainnet for the qualifying live product flow;
- working project, not deckware;
- public repository;
- deployed link or reproducible judge instructions;
- Developer Experience Report;
- small-value real mainnet proof after dry-running through Transaction API.

## Judging Optimization

### Technical Implementation — 30%

The project should demonstrate depth through:

- RWA discovery and normalization;
- underlying-to-token mapping;
- cross-representation comparison where live overlap exists;
- real executable quote retrieval;
- deterministic route scoring;
- transaction simulation before execution;
- wallet state and policy checks;
- mainnet execution;
- robust failure handling;
- persistence of intents, quote snapshots, decisions, simulations, and receipts;
- independently verifiable evidence.

### Creativity & Originality — 25%

The novelty is the abstraction:

**buy the company, not the wrapper.**

The system treats bStocks/Ondo/xStocks as interchangeable implementation rails only when the live data proves they provide equivalent underlying exposure and the route is supported.

Gifting becomes:

**gift exposure intent rather than forcing the sender or recipient to understand a specific token wrapper.**

### Developer Experience Report — 25%

The DevEx report is an engineering artifact from day one, not submission-week documentation.

The team must record:

- time from docs to first signed RWA call;
- authentication/signing issues;
- exact documentation page and section for every issue;
- API error payloads and confusing codes;
- latency for RWA, quote, simulation, and execution calls;
- missing/unsupported assets;
- issuer/representation differences;
- liquidity and slippage observations;
- market-hours behavior;
- Agentic Wallet setup and policy friction;
- exact gaps affecting gifting/transfers;
- redesign suggestions;
- requested API/platform capabilities.

### Product Quality & UX — 20%

The primary interface should resemble a modern consumer banking/investing app.

Crypto mechanics are progressive disclosure, not default UI.

Default language:

- company
- investment
- amount
- available balance
- gift
- claim
- execution quality
- transaction receipt

Advanced details remain inspectable through "Why this route?" and technical receipt views.

## Required Submission Artifacts

- public GitHub repository;
- deployed public product;
- <=4 minute demo video strongly recommended;
- judge instructions;
- Developer Experience Report;
- mainnet transaction evidence;
- exact disclosure of supported assets and known limitations.

## Native Sponsor Dependency

The product is materially dependent on the Binance/BNB stack:

- **RWA Data API** — issuer/platform/token universe, underlying ticker, token/share ratio, token price, reference price, market status;
- **Market API** — market/candle/analytics context where needed;
- **Trading API** — executable cross-DEX quotes/swaps/approvals;
- **Transaction API** — simulation and broadcast/preflight;
- **Wallet API** — balances and current positions;
- **Agentic Wallet / Wallet Skills — CORE PRIZE TARGET** — wallet/session state, balances, user-defined execution authority, wallet-level security limits, supported market/transfer actions, and a judge-visible policy-rejection path where verified. Orchard must use the Wallet layer as real execution authority rather than merely installing a Skill.
- **BNB Chain** — execution venue for the qualifying live product and BSC mainnet transaction proof.
- **BNB Agent Studio — CORE EXTENSION / SPECIAL-PRIZE TARGET** — persistent bounded execution intents that outlive the browser session. The target use is an Orchard persistent agent that monitors an already-authorized conditional intent, maintains an ERC-8004 identity/runtime, and uses Studio self-funding/x402 capabilities for its own runtime/services where supported. It must not become a generic stock-picking agent or replace Orchard's deterministic controls. Any direct bridge from Agent Studio to a user's Agentic Wallet is a GATED integration until independently verified.

Removing Binance's data + execution surface materially weakens or breaks Best Execution.

---

# 3. Product Boundary

## Core Proof — REQUIRED

The MVP is not complete until it can prove all of the following:

1. User chooses an underlying company, not a token contract.
2. If explicit user limits require an adjustment, the requested amount is deterministically adapted before routing and the reason is shown.
3. Backend resolves the underlying to supported BSC tokenized representations.
4. The system normalizes token/share ratios before comparing prices.
5. At least one real executable quote is retrieved from the Binance stack.
6. If multiple equivalent representations/routes exist, each eligible route is independently priced.
7. Route ranking is deterministic and inspectable.
8. The selected route is simulated before real execution.
9. The user confirms the exact spend and expected result.
10. A small-value BSC mainnet transaction executes.
11. A receipt records why the chosen route won.
12. Unsupported/missing routes fail honestly rather than falling back to fake data.

## Supporting UX — REQUIRED

- banking-style home;
- stock search/discovery;
- amount-first buy flow;
- execution preview;
- "Why this route?" transparency;
- portfolio position view;
- shareable investment-intent link;
- claim/share landing page;
- clear errors and unsupported-state UX;
- mobile-responsive design.

## Gift MVP — REQUIRED PRODUCT DIRECTION, MECHANISM GATED

The interface and domain model must support gifting.

However, the exact settlement implementation remains one of these verified options:

### Option A — Direct Asset Gift

Sender buys/holds an eligible tokenized stock and transfers it to the recipient's eligible wallet.

Use only if:

- transfer semantics are supported;
- recipient requirements can be satisfied;
- issuer/asset restrictions permit the flow;
- wallet tooling supports safe recipient delivery.

### Option B — Funded Exposure Claim

Sender commits funds to a claim object representing:

`$X of [underlying] exposure`

Recipient claims later; Best Execution runs at claim time and purchases the current best eligible representation.

Use only if a safe non-custodial or explicitly designed escrow/authorization flow can be implemented and audited.

### Option C — Share-to-Buy Fallback

The share link contains no sender-funded value.

It conveys:

- underlying;
- suggested amount;
- optional note/thesis;
- expiry;
- optional execution constraints.

Recipient funds and executes their own purchase through Best Execution.

**This flow is definitely in MVP because it requires no unverified custody/transfer claim.**

The UI may call only funded flows a "gift." Share-to-Buy must not be misrepresented as funded gifting.

## Stretch

- Agent Studio persistent monitoring;
- recurring investment intents;
- price/route alerting;
- best-execution limit conditions;
- QR/contact-based gift delivery;
- PWA/mobile shell;
- issuer comparison analytics;
- b402-based paid signal verification;
- DeFi utilization after purchase;
- theme baskets.

## Explicit Non-Goals

For MVP:

- no perps;
- no leverage;
- no margin;
- no copy-trading feed;
- no social follower graph;
- no influencer leaderboard;
- no generic crypto trading terminal;
- no arbitrary multi-chain routing;
- no fake fiat/card onramp;
- no investment advice claims;
- no suitability questionnaire or personality-based risk profile;
- no autonomous portfolio optimization;
- no goal-based financial planning;
- no automatic rebalancing in MVP;
- no guaranteed "best price" unless the compared eligible route universe is explicitly bounded;
- no claim that every tokenized version of every stock is supported;
- no unsupported gift custody;
- no hidden synthetic/mock live prices;
- no LLM deciding irreversible money movement.

---

# 4. Canonical User Journeys

## Journey A — First-Time User Buys a Stock

### 1. Landing

Message:

**Buy the company. We handle the on-chain route.**

CTA:

`Get started`

### 2. Wallet / Session

Preferred path:

- connect or authenticate with supported wallet mechanism;
- if Agentic Wallet is used, complete the documented sign-in/session flow;
- confirm BSC mainnet;
- display available spend balance.

Do not claim "no wallet setup" unless the selected wallet flow actually removes it.

### 3. Home

Primary actions:

- Buy a stock
- Explore
- Send / Gift
- Claim

No DEX or token-wrapper selector.

### 4. Search

User searches:

`NVIDIA`

UI resolves:

- NVIDIA
- NVDA
- reference information
- high-level market status
- "tokenized on BNB Chain"

### 5. Amount

User enters:

`$25`

If the amount exceeds an explicit execution limit, show the adaptation before route search.

Example:

```text
You requested: $100
Fits your current limits: $68
Reason: 20% maximum single-company exposure
```

The user may accept, change their own limits, or cancel.

### 6. Execution Search

Backend:

- uses the confirmed requested/adapted amount;
- resolves supported tokenized representations;
- validates equivalence/underlying;
- normalizes ratios;
- fetches candidate executable quotes;
- calculates effective cost;
- simulates viable top route(s);
- ranks routes.

### 7. Preview

Consumer view:

- investment: NVIDIA;
- spend: $25;
- estimated exposure/shares;
- estimated fees;
- selected execution;
- simulation status.

Advanced disclosure:

- representations compared;
- quotes considered;
- reference deviation;
- slippage;
- selected token/route;
- reason code.

### 8. Confirmation

User explicitly confirms.

No automatic execution before confirmation in the baseline MVP.

### 9. Execution

- policy check;
- wallet action;
- mainnet transaction;
- confirmation polling.

### 10. Receipt

Receipt contains:

- intent ID;
- underlying;
- spend;
- selected token representation;
- candidate count;
- ranking factors;
- quote timestamp;
- simulation timestamp/result;
- transaction hash;
- received quantity;
- effective price;
- limitations.

---

## Journey B — Share What to Buy

### Sender

1. opens owned/discovered stock;
2. taps `Share`;
3. chooses suggested amount;
4. optionally adds note;
5. optionally adds expiry;
6. creates share intent;
7. receives public claim/share URL and QR.

### Recipient

1. opens link;
2. sees company, sender's suggested amount, sender note;
3. sees clear statement: **this does not guarantee price, size, or route**;
4. taps `Buy`;
5. authenticates/connects wallet if needed;
6. recipient portfolio + execution profile are loaded;
7. suggested amount is adapted only if the recipient's explicit limits require it;
8. Best Execution runs **fresh** at recipient execution time;
9. recipient confirms;
10. mainnet purchase executes;
11. receipt references originating share intent and any adaptation reason.

No old quote is replayed.

---

## Journey C — Funded Gift

### Sender

1. taps `Gift a stock`;
2. chooses company;
3. enters gift value;
4. enters recipient identifier or creates claim link;
5. sees gift mechanism disclosure;
6. funds/authorizes gift under verified settlement model;
7. gets gift link/QR.

### Recipient

1. opens gift page;
2. sees:
   - sender;
   - company;
   - gift value;
   - message;
   - expiry if any;
3. completes required wallet/eligibility flow;
4. claims;
5. Best Execution runs according to the implemented gift mechanism;
6. receives asset/exposure;
7. both parties receive proof.

### Critical Invariant

A gift page must never imply the recipient already owns stock before settlement is complete.

---

## Journey D — Route Failure

Example:

- RWA search works;
- candidate exists;
- Trading API has no executable route.

UI says:

**NVIDIA is discoverable, but we cannot execute a supported BSC route right now. No transaction was submitted.**

Not:

- fallback fake price;
- generic "something went wrong";
- silent route substitution.

---

## Journey E — Policy Rejection

If Agentic Wallet rejects due to spend limit/token scope/high-risk policy:

UI shows:

- transaction not executed;
- policy reason when available;
- next user action.

This rejection should appear in the judge demo if the integration supports deterministic reproduction.

---

# 5. System Architecture

## Architecture Principle

**AI interprets or assists; deterministic code controls money.**

The MVP does not require an LLM for the core buy flow.

### Lightweight Execution Profile

The user may configure only a small set of explicit execution limits:

- maximum spend per purchase;
- minimum balance to keep available;
- maximum single-company exposure;
- maximum slippage / price deviation.

These limits are deterministic. They are not inferred from personality, age, income, or an AI-generated risk label.

If the requested order already fits the user's limits, no adaptation occurs.

If adaptation is required, the system must show:

- requested amount;
- adapted amount;
- exact triggered limit;
- maximum amount currently permitted;
- options to continue, change the limit, or cancel.

The system must never silently resize an order.

Plain-language forms may later parse:

`Buy $25 of NVIDIA`

but the resolved execution object must become deterministic before any quote or transaction is requested.

## Proposed Monorepo

```text
/
├── apps/
│   ├── web/                    # Next.js consumer app
│   └── worker/                 # optional background jobs / quote refresh / claim tasks
├── packages/
│   ├── domain/                 # canonical types + validation
│   ├── rwa/                    # Binance RWA client + normalization
│   ├── market/                 # market context client
│   ├── execution/              # quote, ranking, simulation, execution
│   ├── wallet/                 # Agentic Wallet / wallet adapter
│   ├── intents/                # buy/share/gift domain logic
│   ├── evidence/               # receipt/evidence capture
│   └── ui/                     # shared design system
├── db/
│   ├── migrations/
│   └── schema/
├── docs/
│   ├── PRODUCT.md
│   ├── PRODUCTION_BLUEPRINT.md
│   ├── DECISIONS.md
│   ├── MILESTONE_STATUS.md
│   ├── EVIDENCE_LEDGER.md
│   └── DEVEX_LOG.md
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

Use exact framework choices only after checking the builder environment and deployment preference. A practical default is Next.js + TypeScript + PostgreSQL.

## Frontend

Responsibilities:

- consumer onboarding;
- search;
- stock detail;
- buy flow;
- execution preview;
- route explanation;
- portfolio;
- share creation;
- gift creation/claim;
- receipt view;
- explicit unsupported/gated states.

No API secret must reach the browser.

## Backend / BFF

Responsibilities:

- Binance request signing;
- input validation;
- asset universe refresh;
- underlying resolution;
- quote orchestration;
- route scoring;
- simulation;
- wallet/execution orchestration;
- intent persistence;
- gift/share state;
- evidence capture;
- transaction confirmation;
- rate limiting;
- idempotency.

## Database

PostgreSQL recommended.

Required because the product needs durable:

- intents;
- quote snapshots;
- route decisions;
- simulations;
- transactions;
- share links;
- gift state;
- evidence;
- DevEx observations.

## Chain / Contracts

Do **not** introduce a custom contract for ordinary buy flow unless required.

For gifting:

- contract/escrow architecture is allowed only if it materially improves safety/non-custody and passes an explicit audit;
- no custom gift contract should be written before issuer/transfer constraints are verified.

## Agent / AI Layer

Baseline:

- optional natural-language parser;
- no autonomous trade decision;
- no route scoring by LLM.

### Agentic Wallet / Wallet Skills — Core Execution Authority

Orchard should deeply integrate Agentic Wallet / Wallet Skills where the verified API surface supports the target tokenized-stock flow:

- wallet authentication and session state;
- wallet address, balances, transaction history, quota/security state;
- quote/order/transfer capabilities where supported for the selected asset route;
- user-defined wallet limits and tradable-token scope;
- high-risk transaction confirmation/rejection behavior;
- execution authority separated from Orchard's product-level adaptation rules.

The desired control stack is:

```text
ORCHARD EXECUTION PROFILE
maximum purchase / reserve / company exposure / slippage
                ↓
ORCHARD BEST EXECUTION
representation + quote + simulation
                ↓
AGENTIC WALLET POLICY
daily quota / token scope / high-risk handling / session authority
                ↓
BSC MAINNET
```

A successful demo should ideally include both a small successful mainnet action and a real policy-controlled rejection. Installing Wallet Skills alone is not sufficient evidence of integration.

### BNB Agent Studio — Persistent Intent Extension

Agent Studio has one narrow product job: **keep a bounded investment intent alive after the user closes Orchard.**

Example:

```text
Buy $25 of NVIDIA
only when:
- best supported route is within 30 bps of reference
- slippage <= 30 bps
- simulation passes
- wallet policy permits
expires: Sunday 20:00 UTC
```

The Studio agent may:

- persist and monitor the bounded intent;
- poll or consume current Orchard/Binance route state;
- maintain its Agent Studio runtime and ERC-8004 identity;
- use x402/self-funding for its own permitted service/runtime costs where verified;
- abstain when conditions fail;
- trigger the secure execution boundary only if the integration with the user's execution authority is verified; otherwise stage/notify rather than falsely claiming autonomous user-fund execution.

Agent Studio must not:

- choose stocks for the user;
- change the requested company or amount beyond explicit Orchard adaptation rules;
- override wallet policies;
- execute through an unverified bridge to Agentic Wallet;
- exist merely to qualify for the special prize.

## Deterministic Control Layer

Must own:

- amount parsing;
- underlying resolution;
- token equivalence checks;
- token/share normalization;
- route eligibility;
- scoring;
- max slippage;
- quote freshness;
- chain ID;
- supported tokens;
- simulation requirement;
- idempotency;
- transaction status;
- gift state transitions.

## Deployment

Proposed:

- Vercel or equivalent for web;
- managed PostgreSQL;
- server-side API routes or dedicated Node service;
- CI via GitHub Actions;
- production environment on public URL;
- BSC mainnet only for qualifying execution.

---

# 6. Data and State Model

## 6.1 UnderlyingAsset

```ts
type UnderlyingAsset = {
  id: string;
  ticker: string;
  name: string;
  sectorTags: string[];
  profileUpdatedAt: string;
};
```

## 6.2 TokenizedRepresentation

```ts
type TokenizedRepresentation = {
  id: string;
  chainId: 56;
  platformId: string;
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  decimals: number;
  underlyingTicker: string;
  tokenToShareRatio: string;
  marketStatus: string | null;
  nextOpenTime: string | null;
  discoveredAt: string;
  rawEvidenceRef: string;
};
```

Never infer ticker equivalence by slicing token symbols. Use explicit provider metadata.

## 6.3 ExecutionProfile

```ts
type ExecutionProfile = {
  userId: string;
  maxSpendPerPurchase?: string;
  minimumAvailableBalance?: string;
  maxSingleCompanyExposureBps?: number;
  maxSlippageBps: number;
  maxReferencePremiumBps?: number;
  updatedAt: string;
};
```

Rules:

- settings are explicit user-controlled constraints;
- no opaque conservative/moderate/aggressive score;
- missing optional fields mean no corresponding product-level limit;
- wallet-level policy remains separate and authoritative where stricter.

## 6.4 ExecutionIntent

```ts
type ExecutionIntent = {
  id: string;
  userId: string;
  type: "BUY";
  underlyingTicker: string;
  spendAsset: string;
  spendAmount: string;
  maxSlippageBps: number;
  maxReferencePremiumBps?: number;
  expiresAt: string;
  status:
    | "DRAFT"
    | "QUOTING"
    | "READY"
    | "REJECTED"
    | "EXECUTING"
    | "CONFIRMED"
    | "FAILED"
    | "EXPIRED";
  createdAt: string;
};
```

## 6.5 CandidateRoute

```ts
type CandidateRoute = {
  id: string;
  intentId: string;
  representationId: string;
  quoteProvider: "BINANCE_WEB3";
  quoteId?: string;
  inputAmount: string;
  expectedOutputTokenAmount: string;
  normalizedExpectedShares: string;
  effectivePricePerShare: string;
  referencePrice?: string;
  referenceDeviationBps?: number;
  priceImpactBps?: number;
  estimatedNetworkCostUsd?: string;
  quoteTimestamp: string;
  expiresAt?: string;
  eligibility: "ELIGIBLE" | "REJECTED";
  rejectionReasons: string[];
};
```

## 6.6 RouteDecision

```ts
type RouteDecision = {
  intentId: string;
  selectedCandidateId: string;
  algorithmVersion: string;
  rankedCandidateIds: string[];
  reasonCodes: string[];
  decidedAt: string;
};
```

## 6.7 SimulationRecord

```ts
type SimulationRecord = {
  id: string;
  intentId: string;
  candidateId: string;
  provider: "BINANCE_TRANSACTION_API";
  result: "PASS" | "FAIL" | "UNKNOWN";
  providerCode?: string;
  failureReason?: string;
  rawEvidenceRef: string;
  simulatedAt: string;
};
```

## 6.8 ExecutionRecord

```ts
type ExecutionRecord = {
  id: string;
  intentId: string;
  selectedCandidateId: string;
  chainId: 56;
  txHash?: string;
  status: "SUBMITTED" | "CONFIRMED" | "REVERTED" | "FAILED";
  actualInputAmount?: string;
  actualOutputAmount?: string;
  confirmedAt?: string;
  evidenceRef?: string;
};
```

## 6.9 ShareIntent

```ts
type ShareIntent = {
  id: string;
  creatorUserId?: string;
  underlyingTicker: string;
  suggestedAmount?: string;
  spendAsset?: string;
  note?: string;
  slug: string;
  expiresAt?: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  createdAt: string;
};
```

A ShareIntent contains **no executable quote** that is trusted later.

## 6.10 GiftIntent

```ts
type GiftIntent = {
  id: string;
  senderUserId: string;
  underlyingTicker: string;
  giftValue: string;
  spendAsset: string;
  recipientHint?: string;
  claimTokenHash: string;
  settlementMode:
    | "DIRECT_ASSET"
    | "FUNDED_CLAIM"
    | "UNRESOLVED";
  status:
    | "DRAFT"
    | "AWAITING_FUNDING"
    | "FUNDED"
    | "CLAIMABLE"
    | "CLAIMING"
    | "CLAIMED"
    | "EXPIRED"
    | "REFUNDED"
    | "FAILED";
  expiresAt?: string;
  createdAt: string;
};
```

Do not activate `FUNDED_CLAIM` in production until the funds-control model is implemented and audited.

## 6.11 EvidenceArtifact

Every material external call may persist:

- provider;
- request ID;
- safe request metadata;
- response status;
- provider code;
- timestamp;
- latency;
- redacted raw payload or stable hash;
- related intent/route/transaction.

Never persist API secrets or wallet credentials.

---

# 7. Personalized Best Execution

The execution pipeline has two deterministic stages:

```text
USER INTENT
    ↓
PORTFOLIO + EXECUTION PROFILE
    ↓
ADAPTED INTENT (only when required)
    ↓
RWA REPRESENTATION DISCOVERY
    ↓
EXECUTABLE QUOTES
    ↓
BEST ROUTE
    ↓
SIMULATION
    ↓
USER AUTHORIZATION
```

## Stage A — Portfolio-Aware Adaptation

The adaptation engine answers only:

> **What is the largest amount within the user's explicit limits for this requested purchase?**

It does not recommend what the user should buy.

Possible constraints:

- per-purchase maximum;
- minimum available balance;
- maximum single-company exposure.

If multiple constraints bind, the smallest permitted amount wins.

The result must contain structured reason codes such as:

- `MAX_PURCHASE_LIMIT`
- `MINIMUM_BALANCE_RESERVE`
- `SINGLE_COMPANY_EXPOSURE`
- `NO_ADAPTATION_REQUIRED`

Example:

```text
Requested: $100 NVDA
Adapted: $68
Reason: SINGLE_COMPANY_EXPOSURE
Configured maximum: 20%
```

### Share Flow Rule

A shared idea carries the sender's suggested amount but **never the sender's executable size or portfolio state**.

The recipient receives a fresh adaptation against:

- recipient portfolio;
- recipient execution profile;
- current market data;
- current route universe.

This establishes the product rule:

> **Share the idea, not the trade.**

### Gift Flow Rule

A funded gift value must not be silently resized by recipient portfolio limits.

If claiming the full gift conflicts with the recipient's configured limits, the product may:

- pause the claim;
- explain the conflict;
- allow the recipient to change their own limit;
- use another verified product policy.

It must not alter what the sender funded without explicit semantics.

## Stage B — Best Execution Algorithm

## Objective

Select the best **eligible executable outcome** for the requested underlying, not merely the lowest displayed token price.

## Step 1 — Resolve Underlying

Input:

`NVIDIA`

Resolve to:

`NVDA`

Resolution must use canonical metadata, not fuzzy execution-time guessing without confirmation.

## Step 2 — Discover Representations

Fetch supported RWA tokens on BSC and filter by explicit:

`underlyingTicker == NVDA`

Potential platforms:

- bStocks;
- Ondo;
- xStocks;
- any additional platform exposed by the API.

Store raw response evidence.

## Step 3 — Validate Economic Equivalence

For each token:

- chain ID = 56;
- valid token contract;
- expected underlying ticker;
- valid token/share ratio;
- platform supported;
- not explicitly unavailable/delisted;
- required market/trading status satisfied.

A token is not eligible merely because its symbol contains `NVDA`.

## Step 4 — Normalize

If:

`tokenToShareRatio = shares represented by one token`

then normalized expected underlying shares must be calculated using provider semantics validated against documentation/live examples.

All decimals use arbitrary-precision decimal math.

No JavaScript floating point for money/ratio comparisons.

## Step 5 — Obtain Executable Quote

Request a real quote for the user's spend asset and requested amount.

A candidate without an executable quote does not participate in "best execution."

## Step 6 — Compute Comparable Economics

For each candidate derive:

- spend amount;
- expected token amount;
- normalized underlying shares;
- effective price per underlying share;
- reference price where available;
- reference deviation;
- price impact/slippage where available;
- estimated network cost if available;
- quote age/freshness;
- simulation status.

## Step 7 — Eligibility Filter

Reject candidates if any hard condition fails:

- wrong chain;
- expired quote;
- invalid ratio;
- unsupported token;
- quote error;
- slippage above user/product maximum;
- route cannot simulate;
- provider marks route unavailable;
- wallet policy forbids token/action;
- required state missing.

## Step 8 — Rank

MVP ranking should prioritize a deterministic all-in execution metric:

1. highest normalized underlying shares received for fixed spend;
2. then lower explicit fees/network cost where comparable;
3. then fresher quote;
4. then lower price impact;
5. deterministic tie-breaker.

Do **not** invent a weighted "AI score" unless empirical evidence justifies it.

Reference deviation is primarily transparency/risk information, not automatically the execution objective.

## Step 9 — Simulate

Before preview is labeled "ready":

- simulate selected route;
- optionally simulate runner-up when feasible;
- reject selected route if simulation fails;
- rerank remaining eligible routes.

## Step 10 — Freeze Preview

Preview must include:

- quote timestamp;
- expiry/freshness limit;
- selected candidate;
- expected output;
- user spend;
- allowed slippage.

If expired before confirmation, requote.

## Step 11 — Execute

After explicit user confirmation:

- ensure idempotency key;
- revalidate session/policy;
- revalidate quote if necessary;
- submit;
- persist tx hash;
- poll/subscribe until terminal;
- reconcile actual received amount.

## Claim Language

Until live overlap is proven, UI and marketing must say:

> "We compare supported eligible routes."

Not:

> "We always find the cheapest tokenized stock on BNB Chain."

---

# 8. API / Service Boundaries

## Internal Endpoints

Suggested BFF API:

```text
GET  /api/assets
GET  /api/assets/:ticker
POST /api/intents/buy
POST /api/intents/:id/quote
POST /api/intents/:id/simulate
POST /api/intents/:id/execute
GET  /api/intents/:id
GET  /api/receipts/:id

POST /api/shares
GET  /s/:slug
POST /api/shares/:slug/adopt

POST /api/gifts
GET  /g/:claimToken
POST /api/gifts/:claimToken/claim

GET  /api/portfolio
GET  /api/capabilities
GET  /api/health
```

## `/api/capabilities`

Must expose truthful runtime capability flags:

```json
{
  "rwaDiscovery": true,
  "liveQuotes": true,
  "transactionSimulation": true,
  "mainnetExecution": false,
  "agenticWallet": false,
  "shareIntent": true,
  "fundedGifting": false
}
```

This prevents the UI from implying features are live before verified.

---

# 9. Trust and Security Boundaries

## Non-Negotiable Invariants

1. Browser never receives Binance API signing secrets.
2. All monetary amounts are validated server-side.
3. All chain execution is pinned to BSC chain ID 56 for qualifying flows.
4. No quote is executable after freshness/expiry rules fail.
5. Every execution requires a persisted intent.
6. Every execution uses an idempotency key.
7. No route is selected from unnormalized token prices.
8. Simulation is required before qualifying mainnet execution.
9. UI cannot mark transaction complete before chain/provider terminal confirmation.
10. Share links cannot execute using the sender's stale quote.
11. Gift claim token is stored hashed.
12. Gift claim is single-use.
13. Gift state transitions are concurrency-safe.
14. A failed gift claim cannot silently burn/strand funds.
15. No LLM can bypass spend/policy/eligibility controls.
16. Unsupported issuer/transfer state fails closed.
17. Secrets never enter logs/evidence artifacts.

## Authentication

Use the wallet/session mechanism actually supported by the chosen wallet integration.

Do not implement fake login identities that are disconnected from the wallet that signs/executes.

## Gift Security

If funded gifting is implemented:

- claim token >= 128 bits entropy;
- hash at rest;
- single-use transactionally enforced;
- expiry;
- explicit refund behavior;
- race-safe claim;
- sender cannot double-spend;
- recipient cannot claim twice;
- funds cannot be redirected by changing query params;
- no open redirect in claim page;
- audit all state transitions.

## Address Transfers

If direct transfer is used:

- require supported addressbook/recipient semantics if Agentic Wallet requires it;
- validate chain/address;
- show exact recipient;
- confirmation before irreversible transfer;
- do not accept arbitrary untrusted ENS-like labels without verified resolution.

---

# 10. External Dependency Matrix

| Dependency | Purpose | Initial Status | Verification Required | Fallback |
|---|---|---:|---|---|
| Binance Web3 API credentials | signed RWA/market/trading calls | GATED | successful signed call | stop live integration |
| RWA Data API | token universe + underlying mapping | AVAILABLE BUT UNVERIFIED IN PROJECT | live BSC universe dump | no mock for prod |
| Trading API | executable quotes/swaps | AVAILABLE BUT UNVERIFIED IN PROJECT | target token quote | supported-route only |
| Transaction API | preflight/simulation | AVAILABLE BUT UNVERIFIED IN PROJECT | simulate selected route | no live execution |
| Wallet API | balances/portfolio | AVAILABLE BUT UNVERIFIED IN PROJECT | connected wallet balance | limited portfolio UX |
| Agentic Wallet | constrained wallet execution | AVAILABLE BUT UNVERIFIED IN PROJECT | BSC auth + target trade/transfer | standard supported wallet adapter |
| BSC mainnet | settlement | VERIFIED PLATFORM | small tx | none for qualifying demo |
| bStocks/Ondo/xStocks | tokenized stock asset | UNKNOWN PROJECT UNIVERSE | live enumeration | use verified platform subset |
| Representation overlap | cross-wrapper best execution | UNKNOWN | underlying intersection report | best-route within available representation |
| Gift transfer eligibility | direct gift | UNKNOWN | live/documented asset transfer test | Share-to-Buy |
| Funded claim custody/escrow | delayed gift | NOT STARTED | threat model + test + audit | Share-to-Buy |
| Public hosting | judge access | NOT STARTED | external health check | none |
| PostgreSQL | durable intents/evidence | NOT STARTED | migrations + CI | equivalent managed SQL |

Statuses must be updated from evidence, not optimism.

---

# 11. AI Methodology

## Baseline

AI is **not required** for the Best Execution core.

That is intentional.

The strongest architecture is:

`USER INTENT → DETERMINISTIC DOMAIN OBJECT → PROVIDER DATA → DETERMINISTIC ROUTE ENGINE → SIMULATION → USER CONFIRMATION → EXECUTION`

## Natural Language

If implemented:

Input:

`Buy $25 of NVIDIA`

Parser output:

```json
{
  "action": "BUY",
  "underlying": "NVDA",
  "spendAmount": "25",
  "spendCurrency": "USDT"
}
```

The user must see/confirm resolved semantics before execution.

## LLM Rules

- never generate contract addresses;
- never invent token mappings;
- never invent quotes;
- never decide transaction success;
- never override eligibility;
- never override slippage/policy;
- never mark a gift funded/claimed;
- never be the system of record.

---

# 12. Project Constitution

1. No hardcoded or mocked core capability may be represented as live.
2. No shortcut is acceptable merely due to deadline pressure if it invalidates the core claim.
3. Binance/BNB technology must be materially integrated.
4. Money, route selection, authorization, gift state, and risk controls are deterministic.
5. Implemented does not mean verified.
6. Unit tests do not equal production readiness.
7. External gates are recorded explicitly.
8. Public deployment claims require a public deployment.
9. Live-data claims require live provider evidence.
10. Evidence is preserved for material capabilities and failures.
11. Scope changes that alter the thesis require explicit approval and blueprint update.
12. Submission wording cannot exceed verified capability.
13. No unverified ticker mapping by string slicing.
14. No stale quote replay.
15. No funded gift feature is called live until its funds-control model passes independent review.
16. The DevEx report is based on actual builder observations and logs, not generated retrospective filler.

---

# 13. Implementation Milestones

## M0 — Repository Bootstrap

### Deliverables

- repo initialized;
- `AGENTS.md`;
- `CLAUDE.md`;
- `docs/PRODUCT.md`;
- this blueprint;
- `docs/DECISIONS.md`;
- `docs/MILESTONE_STATUS.md`;
- `docs/EVIDENCE_LEDGER.md`;
- `docs/DEVEX_LOG.md`;
- CI skeleton;
- environment example with no secrets.

### Acceptance

- all agents know canonical skill repo;
- all source-of-truth docs named;
- CI runs;
- no credentials committed.

### Audit

Bootstrap completion gate.

---

## M1 — Live Binance Authentication + RWA Universe

### Deliverables

- signed Binance Web3 client;
- RWA platform list;
- RWA token list;
- raw evidence capture;
- normalized token table;
- underlying grouping;
- overlap report.

### Required Output

Machine-readable report:

```json
{
  "totalRepresentations": 0,
  "uniqueUnderlyings": 0,
  "multiRepresentationUnderlyings": 0,
  "platformCounts": {},
  "generatedAt": ""
}
```

### Acceptance

- real API response;
- chain ID verified;
- token/share ratios persisted exactly;
- no manual ticker list in core data path;
- multi-representation underlyings identified from provider metadata.

### Stop/Decision Gate

If multi-representation overlap is too weak, update scope honestly:

Best Execution remains, but do not sell cross-wrapper competition as the main proof.

---

## M2 — Quote Feasibility + Route Normalization

### Deliverables

- Trading API client;
- spend asset selection;
- candidate quote retrieval;
- arbitrary-precision normalization;
- effective price/share calculation;
- quote freshness policy;
- deterministic eligibility.

### Acceptance

For at least one live target asset:

- quote retrieved;
- normalized expected shares computed;
- route output reproducible;
- failures classified;
- provider error evidence recorded.

For multi-representation target, if available:

- >=2 candidate representations quoted independently.

---

## M3 — Transaction Simulation

### Deliverables

- Transaction API client;
- candidate simulation;
- rerank-on-failure logic;
- simulation evidence;
- preview freeze.

### Acceptance

- selected live route simulates successfully;
- deliberately invalid candidate fails safely;
- no execution occurs when simulation fails.

---

## M4 — Banking-Style Consumer UI

### Deliverables

- design system;
- responsive home;
- stock search;
- stock detail;
- amount entry;
- execution loading state;
- preview;
- advanced route explanation;
- receipt shell;
- unsupported-state screens.

### Acceptance

A first-time user can move from home to execution preview without seeing:

- raw contract address;
- DEX selection;
- wrapper selection;
- manual slippage form.

Technical details remain optionally inspectable.

---

## M5 — Wallet + Small Mainnet Execution

### Deliverables

- wallet/session integration;
- balance check;
- user confirmation;
- policy check;
- transaction submission;
- confirmation reconciliation;
- persistent receipt.

### Acceptance

- small real BSC mainnet trade;
- transaction hash;
- actual received quantity reconciled;
- duplicate execute request cannot double-submit;
- insufficient balance path handled;
- expired quote triggers requote;
- evidence ledger updated.

### Critical Proof

This milestone establishes the minimum qualifying live product.

---

## M6 — Portfolio + Lightweight Execution Profile

### Deliverables

- wallet position retrieval;
- normalized holdings;
- company-first portfolio UI;
- execution-profile settings;
- deterministic amount adaptation;
- structured adaptation explanations;
- link position to execution receipts.

### Acceptance

- purchased tokenized stock appears as its underlying company in portfolio UI while preserving technical detail under disclosure;
- a request that fits the user's limits remains unchanged;
- a request that violates a configured limit is adjusted deterministically;
- the user sees the exact reason before quote routing;
- no advisory/risk-personality label is introduced.

---

## M7 — Share-to-Buy

### Deliverables

- ShareIntent model;
- public share URL;
- expiry/revoke;
- recipient page;
- adopt intent;
- fresh execution at recipient time.

### Acceptance

- sender creates share;
- recipient opens unauthenticated;
- sender portfolio/execution authority is not embedded;
- stale original quote is never reused;
- recipient amount is independently adapted against recipient limits where required;
- recipient can independently execute current Best Execution flow;
- share expiry works.

---

## M8 — Gift Feasibility Gate

### Deliverables

A written evidence-backed decision covering:

- token transfer support;
- issuer restrictions;
- recipient requirements;
- Agentic Wallet transfer constraints;
- eligibility/geographic constraints surfaced by provider/issuer;
- direct gift feasibility;
- funded-claim feasibility;
- custody/security implications.

### Outcome

Choose exactly one:

- `DIRECT_ASSET`
- `FUNDED_CLAIM`
- `SHARE_ONLY_FOR_MVP`

No code theater.

---

## M9 — Funded Gift / Direct Gift

Only run if M8 passes.

### Deliverables

- gift creation;
- secure claim;
- settlement;
- expiry;
- refund/recovery;
- concurrency controls;
- receipt.

### Acceptance

- small real-value gift;
- single-use claim;
- double-claim rejected;
- expired claim safely handled;
- failure cannot strand funds without recovery path;
- exact sender/recipient receipts.

---

## M10 — Agentic Wallet + Agent Studio Deep Integration

### M10A — Agentic Wallet / Wallet Skills — Core

#### Deliverables

- documented Agentic Wallet authentication/session flow;
- wallet balance/quota/security state surfaced where available;
- verified tokenized-stock execution or supported execution handoff;
- policy enforcement evidence;
- transaction logging and reconciliation;
- explicit capability flags for unsupported Wallet actions.

#### Acceptance

- Wallet integration is used by the real Orchard execution path, not a disconnected demo;
- at least one successful supported action is evidenced;
- one deterministic wallet-policy rejection is captured where reproducible;
- Orchard cannot bypass Wallet-level restrictions;
- the DevEx log records exact setup friction, errors, missing capabilities, and documentation gaps.

### M10B — BNB Agent Studio — Persistent Conditional Intent

#### Deliverables

- one Orchard persistent agent deployed through Agent Studio;
- ERC-8004 identity evidence;
- bounded conditional-intent schema;
- autonomous runtime that remains active without the Orchard browser session;
- condition monitoring with deterministic Orchard rules;
- abstention/expiry behavior;
- x402/self-funding evidence for the agent's own allowed costs where supported;
- secure execution handoff or notification fallback based on verified Agentic Wallet interoperability.

#### Acceptance

- the agent solves a real persistence problem;
- it cannot rewrite investment intent;
- it cannot bypass Orchard or Wallet constraints;
- an expired/failed condition does not execute;
- the deployed agent identity/runtime can be independently inspected;
- no claim of autonomous user-fund execution is made unless that exact end-to-end path is verified.

### Judge Proof

Ideal sequence:

1. user creates a bounded conditional NVIDIA intent in Orchard;
2. Orchard shows the exact deterministic conditions;
3. Agent Studio accepts the bounded task and remains live after the browser closes;
4. the agent evaluates current route state and either **ABSTAINS** or proceeds;
5. Agentic Wallet applies the user's independent wallet policy;
6. action executes on BSC mainnet only if every layer passes.

This is the intended special-prize story: **persistent autonomous monitoring + explicit identity/self-funding + independent wallet authority**, without turning Orchard into an opaque trading bot.

---

## M11 — Production Deployment

### Deliverables

- public URL;
- production DB;
- secret configuration;
- CI/CD;
- health endpoint;
- structured logs;
- error monitoring;
- rate limiting;
- basic abuse controls;
- database backup strategy;
- rollback instructions.

### Acceptance

- fresh browser can use product;
- judge does not need local setup;
- production capabilities endpoint is truthful;
- repo/demo/deployed URL remain accessible through judging.

---

## M12 — Final Evidence + Submission Audit

### Deliverables

- Blueprint Audit;
- Evidence Audit;
- submission claim inventory;
- <=4 minute demo;
- README;
- judge instructions;
- DevEx report;
- known limitations;
- mainnet proof.

### Acceptance

Every material claim maps to evidence.

---

# 14. Testing Strategy

## Unit

Test:

- execution-profile validation;
- maximum-per-purchase adaptation;
- minimum-balance reserve adaptation;
- single-company exposure adaptation;
- no-adaptation path;
- multiple-binding-constraint selection;
- structured adaptation reason codes;
- money parsing;
- decimal math;
- token/share normalization;
- candidate eligibility;
- route ranking;
- tie-breaker;
- quote expiry;
- intent transitions;
- share expiry;
- gift state machine;
- claim token hashing;
- capability flags.

## Contract / Schema

Validate all external responses at runtime.

Provider schema drift must fail visibly.

## Integration

Use controlled provider-backed tests for:

- RWA search/list;
- target asset;
- quote;
- simulation;
- wallet balance;
- execution status.

Live tests opt-in and never run automatically with spend.

## Negative Paths

Required:

- unknown ticker;
- unsupported representation;
- missing token/share ratio;
- API auth failure;
- provider 4xx;
- provider 5xx;
- timeout;
- rate limit;
- empty quote;
- stale quote;
- price impact above max;
- simulation fail;
- user rejects;
- requested amount exceeds per-purchase maximum;
- requested amount violates minimum balance reserve;
- requested amount violates single-company exposure;
- user declines adapted amount;
- insufficient funds;
- wrong chain;
- execution revert;
- duplicate execution;
- wallet policy rejection;
- expired share;
- revoked share;
- invalid gift token;
- duplicate gift claim;
- gift expiry;
- recipient eligibility failure.

## Database / Migrations

- migration up/down where supported;
- unique/idempotency constraints;
- concurrency test for gift claim;
- transaction boundary for execution state;
- no orphaned selected route;
- no terminal status regression.

## E2E

At minimum:

1. Search → quote → simulate → preview.
2. Search → buy → mainnet confirmation.
3. Share → open → fresh quote.
4. Gift flow if verified.
5. Policy rejection if Agentic Wallet path supports it.

## Security Invariants

Independently test:

- API keys server-only;
- authorization on private intent/receipt endpoints;
- share/gift public data minimized;
- claim token security;
- no arbitrary redirect;
- no parameter tampering to change underlying/amount after funding;
- replay/idempotency;
- no cross-user receipt access.

---

# 15. Deployment Plan

## Environments

### Development

- local;
- provider credentials in ignored env;
- BSC mainnet read/quote allowed;
- no automatic spend.

### Preview

- per-PR deployment;
- no production secret unless explicitly required;
- execution capability disabled by default.

### Production

- public URL;
- BSC chain ID 56;
- production DB;
- execution enabled only after M5 gate.

## CI

Required jobs:

- formatting/lint;
- typecheck;
- unit tests;
- integration tests using safe fixtures/local DB;
- build;
- dependency audit;
- migration check.

Live provider tests are opt-in/manual unless they are read-only and safe.

## Secrets

Never commit:

- Binance API key;
- signing secret;
- wallet/session credentials;
- DB credentials.

## Observability

Log:

- request/correlation ID;
- provider;
- operation;
- latency;
- status;
- provider code;
- intent ID;
- route ID;
- tx hash when public.

Never log secrets or claim tokens.

## Rollback

- previous deployment retained;
- DB migrations backward-safe where practical;
- capability flags can disable execution/gifting without breaking read-only product.

---

# 16. DevEx Evidence System

Create `docs/DEVEX_LOG.md` immediately.

Every relevant issue should record:

```text
Timestamp:
Developer:
Docs URL/page:
Operation:
Goal:
Expected:
Observed:
HTTP/provider code:
Latency:
Workaround:
Was docs behavior accurate?:
Suggested fix:
Evidence ref:
```

## Mandatory Categories

### Onboarding

Start timer at first docs/API access.

Record first successful signed call.

### Documentation Issues

Exact page and section only.

### API Pitfalls

Include:

- error payload;
- parameter;
- asset;
- endpoint;
- time;
- resolution.

### AI Stack

Record Agentic Wallet / Wallet Skills:

- install friction;
- auth friction;
- session behavior;
- wallet policy behavior;
- unsupported transaction types;
- transfer restrictions;
- errors.

### Tokenized Stock Specifics

Capture:

- issuer/platform;
- underlying;
- token/share ratio;
- quote depth;
- slippage;
- reference difference;
- market open/closed;
- representation overlap;
- route failures.

### Redesign Suggestions

Tie suggestion to actual friction.

### Requested Capabilities

Examples only if encountered:

- underlying-grouped best-execution endpoint;
- issuer-normalized quote response;
- transferability/eligibility metadata;
- machine-readable reason a token is not tradeable;
- quote comparison API.

Do not fabricate feedback because it sounds useful.

---

# 17. Demo Proof Plan

Target: 3:30–4:00.

## Scene 1 — Problem in 20 Seconds

Show two tokenized representations / route options for same underlying if live overlap exists.

Message:

**The user wants NVIDIA. Why are we asking them to choose the wrapper?**

If overlap is not available, show the real complexity of representation + route selection without pretending multiple wrappers exist.

## Scene 2 — Consumer Buy

User types/selects:

`NVIDIA`

Enters:

`$5–$25`

System shows:

**Finding the best supported execution**

Then advanced drawer:

- candidates;
- normalized exposure;
- quote;
- slippage;
- simulation.

## Scene 3 — Mainnet Execution

Confirm.

Show:

- wallet/policy;
- BSC mainnet transaction;
- receipt;
- "Why this route?"

## Scene 4 — Social Onboarding

Create:

`Share $25 of NVIDIA`

Open recipient link in separate/incognito browser.

Show fresh Best Execution.

If funded gifting is verified, use:

`AJ sent you $X of NVIDIA`

and claim it.

If not verified, do **not** fake gifting. Demo Share-to-Buy and state funded gifting is gated by transfer/issuer constraints.

## Scene 5 — Failure / Guardrail

Ideal:

Agentic Wallet rejects a deliberately over-limit action.

Alternative:

show stale quote invalidation or simulation failure.

## Scene 6 — DevEx Evidence

End briefly with:

- real API modules used;
- mainnet tx;
- exact DevEx observations;
- public URL.

---

# 18. Evidence Ledger

Minimum claim inventory:

| Claim | Required Evidence | Initial Status |
|---|---|---|
| RWA universe comes from Binance API | live signed response | PLANNED |
| Underlyings mapped from provider metadata | persisted raw + normalized record | PLANNED |
| Multiple representations compared | live overlap + quotes | NEEDS VALIDATION |
| Route ranking deterministic | unit tests + source | PLANNED |
| Selected route simulated | simulation response | PLANNED |
| Mainnet execution works | BSC tx hash | PLANNED |
| Agentic Wallet executes | wallet evidence + tx | NEEDS VALIDATION |
| Agentic Wallet policy rejects unsafe action | reproducible rejection | NEEDS VALIDATION |
| Share link requotes fresh | integration/E2E | PLANNED |
| Recipient share execution adapts to recipient limits | deterministic test + E2E | PLANNED |
| Buy amount adaptation is deterministic and explainable | unit/integration tests | PLANNED |
| Funded gifting works | real gift + claim + receipt | GATED |
| App publicly available | public URL external check | PLANNED |
| Consumer UX hides wrapper choice | E2E/demo | PLANNED |
| DevEx report is evidence-based | dated log | PLANNED |

---

# 19. Claim Boundaries

## Allowed Once Verified

- "Users choose a company and amount; the app chooses among supported executable routes."
- "We use Binance RWA data to resolve tokenized representations."
- "We simulate the selected route before execution."
- "The demo executes on BSC mainnet."
- "Shared investment intents are re-priced when the recipient acts."
- "Shared ideas execute independently against the recipient's current portfolio and explicit limits."
- "If a requested purchase exceeds an explicit user limit, the app explains and proposes the maximum permitted amount before routing."

## Allowed Only if Live Evidence Exists

- "We compare bStocks and Ondo for the same underlying."
- "Agentic Wallet enforces the user's limits on this flow."
- "Users can gift funded stock exposure."
- "Recipients can claim without already having a wallet."
- "We support xStocks."

## Forbidden Without Proof

- "We always find the cheapest price."
- "We compare every tokenized-stock issuer."
- "Zero fees."
- "Guaranteed best execution."
- "No slippage."
- "No wallet required."
- "Any stock can be gifted."
- "Fully autonomous."
- "Production-ready" before public deployment, failure controls, live evidence, and final audit.

---

# 20. Risks and Gates

## Critical

### R1 — Insufficient Representation Overlap

If the same underlying is not available through multiple executable representations, the headline cross-wrapper comparison weakens.

Mitigation:

- validate before UI;
- retain best-route abstraction;
- never fabricate overlap;
- use representation vs DEX route competition if genuinely exposed.

### R2 — Gifting Restricted

Tokenized-security transferability or recipient eligibility may prevent direct gifting.

Mitigation:

- Share-to-Buy is independent and required;
- run M8 before implementing funded gifting;
- communicate limitations.

### R3 — Trading API Does Not Route Target Assets

Mitigation:

- build capability matrix;
- select demo asset from verified supported universe;
- no manual fallback hidden behind UI.

## High

### R4 — Agentic Wallet Cannot Execute Required Tokenized Stock Route

Mitigation:

- treat as independent adapter;
- prove early;
- use supported wallet execution path if rules permit;
- do not claim special-prize integration without depth.

### R5 — Quote Comparisons Are Not Economically Comparable

Mitigation:

- normalize token/share ratios;
- arbitrary precision;
- compare fixed spend to underlying-share output;
- account for explicitly available cost fields;
- document unknown fees.

### R6 — Mainnet Liquidity Causes Demo Failure

Mitigation:

- small amounts;
- pre-demo read-only health check;
- choose high-liquidity verified asset;
- never pre-record a fake live result;
- retain transaction evidence fallback for explanation, not live claim substitution.

## Medium

### R7 — Banking UI Hides Too Much

Mitigation:

progressive disclosure with "Why this route?" and receipt.

### R8 — Scope Creep

Mitigation:

core milestones M1–M7 and verified Agentic Wallet execution before nonessential DeFi/social extras. Agent Studio may begin in parallel only after its bounded persistence contract is specified; it must not delay the core mainnet Buy proof.

---

# 21. Definition of Done

The public MVP is complete only when:

1. a public repo exists;
2. public deployment is reachable;
3. BSC mainnet is the execution chain;
4. live Binance RWA data populates the product;
5. user can select an underlying company and amount;
6. supported representations/routes are discovered from live metadata;
7. quote normalization is deterministic;
8. selected route is simulated;
9. small real mainnet trade succeeds;
10. receipt explains route choice;
11. wallet/portfolio shows resulting position;
12. lightweight execution limits can deterministically adapt an oversized request with an explicit reason;
13. share intent works end-to-end, adapts independently for the recipient where required, and requotes fresh;
14. gift UI is either truly funded/claimable or clearly limited to share-to-buy;
15. important negative paths fail safely;
16. CI is green;
17. no secrets are committed;
18. capability endpoint reflects reality;
19. Agentic Wallet / Wallet Skills are either deeply integrated into the real execution path with evidence or explicitly marked gated;
20. the Agent Studio persistent-intent extension is deployed and evidenced for the special-prize target, or explicitly removed from submission claims if the integration gate fails;
21. DevEx log contains actual observations from development;
22. Blueprint Audit passes with no critical false-completeness finding;
23. Evidence Audit maps every submission claim to proof;
24. README, demo, and submission wording match verified capability.

---

# 22. Handover Protocol

Every handover must include:

## Source

- repository;
- branch;
- commit SHA;
- dirty/clean state.

## Deployment

- public URL;
- deployment identifier;
- capability state.

## Verification

- tests passed;
- live probes;
- mainnet tx hashes;
- provider operations verified.

## Current Milestone

- intended capability;
- actual capability;
- incomplete work.

## Gates

- credentials;
- provider support;
- liquidity;
- transfer/gift eligibility;
- funds;
- wallet integration.

## Next Dependency-Ordered Tasks

One ordered list only.

## Prohibited Shortcuts

- no hardcoded ticker universe presented as provider discovery;
- no mock quote in live path;
- no static "best route" label;
- no fake transaction success;
- no gift funded badge without locked/settled funds;
- no stale share quote execution;
- no production claim from localhost;
- no "Agentic Wallet integrated" claim from merely installing the skill.

---

# 23. Initial Spec-Driven Build Order

After this blueprint is approved, invoke the canonical Spec-Driven Build skill.

The first feature specification should be:

## Feature 001 — Live RWA Universe and Best-Execution Feasibility

### Goal

Prove whether the core Best Execution thesis is supported by the live Binance/BSC universe before building the consumer UI.

### Inputs

- Binance Web3 API credentials;
- RWA endpoints;
- BSC chain ID 56.

### Outputs

- signed API client;
- raw evidence store;
- normalized token universe;
- underlying grouping;
- overlap matrix;
- quote capability matrix;
- simulation capability matrix;
- DevEx entries.

### Acceptance

The team can answer with live evidence:

- how many unique underlyings exist;
- how many representations per underlying;
- which platforms are present;
- which target assets can actually be quoted;
- which candidate routes simulate;
- whether the strongest Best Execution demo is feasible.

### Stop Condition

If live data contradicts the multi-representation thesis, update the blueprint before implementing UI. Do not hardcode a demonstration universe.

---

# 24. Reference Architecture Flow

```text
                         ┌─────────────────────┐
                         │  Consumer Web App   │
                         │ banking-style UX    │
                         └─────────┬───────────┘
                                   │
                        company + amount intent
                                   │
                                   ▼
                         ┌─────────────────────┐
                         │ Intent Service      │
                         │ validation/state    │
                         └─────────┬───────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────┐
                  │ RWA Resolution / Normalization │
                  │ Binance RWA Data API           │
                  └───────────────┬────────────────┘
                                  │
                     eligible representations
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ Quote Orchestrator   │
                       │ Binance Trading API  │
                       └──────────┬───────────┘
                                  │
                           candidate routes
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ Best Execution       │
                       │ deterministic engine │
                       └──────────┬───────────┘
                                  │
                            selected route
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ Transaction Preflight│
                       │ Simulation API       │
                       └──────────┬───────────┘
                                  │ PASS
                                  ▼
                       ┌──────────────────────┐
                       │ User Confirmation    │
                       └──────────┬───────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │ Wallet / Agentic Wallet  │
                    │ policy + execution       │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                          BSC MAINNET TX
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │ Receipt + Evidence       │
                    └──────────────────────────┘
```

Share/Gift enters through a separate intent object but converges on the same execution engine.

```text
SHARE / GIFT
     │
     ▼
intent / claim
     │
     ▼
recipient session
     │
     ▼
FRESH BEST EXECUTION
     │
     ▼
simulation → confirmation → BSC
```

---

# 25. Sources of Truth

1. `docs/PRODUCT.md` — product contract.
2. `docs/PRODUCTION_BLUEPRINT.md` — architecture, milestones, proof.
3. `docs/DECISIONS.md` — approved changes.
4. `docs/MILESTONE_STATUS.md` — truthful current status.
5. `docs/EVIDENCE_LEDGER.md` — claim proof.
6. `docs/DEVEX_LOG.md` — first-hand developer experience record.
7. `phllp-tanstic/hackathon-skills` — canonical methodology.

If implementation conflicts with the blueprint, flag **PRODUCT/BLUEPRINT DRIFT**. Do not rewrite the blueprint after the fact simply to make the code appear compliant.

---

# 26. Official Technical References

- BNB Hack: Tokenized Stocks Edition  
  https://www.bnbchain.org/en/hackathons/tokenized-stocks

- Binance Web3 API — RWA Data  
  https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data

- Binance Web3 API documentation  
  https://web3.binance.com/en/dev-docs/introduction

- Binance Agentic Wallet  
  https://developers.binance.com/en/docs/products/agentic-wallet/welcome

- Binance Wallet Skills  
  https://web3.binance.com/en/dev-docs/products/wallet-skills/supported-skills

- BNB Chain documentation  
  https://docs.bnbchain.org/

---

# 27. Final Bootstrap Gate

Before implementation scales beyond Feature 001, every agent must be able to answer:

- What are we building?
- Who is it for?
- What is the core claim?
- Which Binance modules are structurally required?
- Which document is authoritative?
- What is currently verified versus gated?
- What evidence proves the current milestone?
- Which feature is forbidden from being presented as live?

For this project the answer is:

> **We are building Orchard: a consumer tokenized-stock execution account where the user chooses the company and amount and Orchard chooses the best supported execution rail. Lightweight portfolio limits may adapt the amount; Share/Gift onboarding reuses the same deterministic execution engine; Agentic Wallet is the wallet-level authority; and Agent Studio provides a bounded persistent-intent extension. The first task is not UI—it is proving the live route universe.**
