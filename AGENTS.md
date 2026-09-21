# Orchard: Agent Operating File

Applies to every coding agent working in this repository (Claude Code, Codex, Cline, others).
`CLAUDE.md` points here. Keep this file short. Do not duplicate the control documents.

## Project

Orchard is a banking-style consumer investment account for tokenized stocks on BNB Chain
(BNB Hack: Tokenized Stocks Edition). Line: **Buy the company. We choose the rail.**

## Source of truth (read before any material decision)

| Priority | File | Role |
|---|---|---|
| 1 | `docs/DECISIONS.md` (once created) | Owner approvals. Wins over everything below |
| 2 | `docs/ORCHARD_PRODUCTION_BLUEPRINT.md` | Product and architecture baseline. The blueprint calls this file `docs/PRODUCTION_BLUEPRINT.md`; same document |
| 3 | `docs/ORCHARD_AGENT_INSTRUCTIONS.md` | Role, constitution, sponsor-stack intent, communication protocol |
| 4 | `docs/ORCHARD_HACKATHON_RESOURCES_AND_ROADMAP.md` | Hackathon rules, official links, roadmap. Official docs win on facts |
| 5 | Canonical method: https://github.com/phllp-tanstic/hackathon-skills | Start at `SKILLS_INDEX.md`. Active skill: `skills/spec-driven-build/SKILL.md` |
| 6 | Live provider evidence | Beats documentation on provider behavior |

The three `docs/ORCHARD_*.md` files are byte-identical copies of the locked control documents.
Do not edit them. Propose changes through a decision record.

## Non-negotiable rules

- Follow the constitution in the blueprint (section 12) and agent instructions (section 3).
- No hardcoded or mocked capability in any runtime path. No fake quotes, routes, transactions, or claims.
- Test fixtures live only in `test/fixtures/`, are prefixed `DOC_EXAMPLE_` or `SYNTHETIC_`, and are never imported from `src` or written to `evidence/`.
- Money, route selection, amount adaptation, and authorization are deterministic code. No LLM decides money movement.
- Never commit secrets. Never log them. Live provider calls are run locally by the owner, never in CI.
- Implement one bounded task at a time. If the spec is wrong or ambiguous, stop and report. Do not code around it.
- Critical decisions need the owner's explicit approval before they are carried out.
- DevEx: the narrative entries in `docs/DEVEX_LOG.md` are written by the owner. Agents may capture raw tool observations only.

## Public repository (building in public)

This repository is public from the first commit. Commit nothing you would not publish.

- Secrets: never commit keys, secrets, session data, or `.env` files. CI runs gitleaks with `.gitleaks.toml` on every push.
- Evidence: raw provider payloads stay in `evidence/raw/` (git-ignored). Only `evidence/manifest.jsonl` is committed.
- The manifest holds safe metadata only: no secrets, no signatures, and wallet addresses in request parameters are redacted or hashed.
- Promoting raw evidence to a public path is a manual, reviewed step by the owner.
- Wallet addresses, order IDs, and account details from the owner's Binance or Agentic Wallet sessions are never committed unless the owner explicitly approves that specific artifact.

## Status vocabulary

`VERIFIED` (reproduced with current evidence), `PARTIAL`, `GATED`, `NOT IMPLEMENTED`, `DEVIATED`, `UNVERIFIED`.
Provider capabilities: `DOCUMENTED`, `VERIFIED LIVE`, `GATED`, `UNKNOWN`.
Never write "done", "live", "integrated", or "works" without the evidence that word implies.

## Completion report (every task)

Files changed | behavior implemented | tests run with exact results | blockers and gates |
deviations from the spec | unverified claims.
