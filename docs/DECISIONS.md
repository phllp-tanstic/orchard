# Decisions

Owner approvals. This file wins over every other document except live provider evidence in
the narrow sense described in `AGENTS.md`'s source-of-truth table.

Status vocabulary for decisions: `APPROVED`, `OPEN`.

## Approved

### DEC-001

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Feature 001 approved, split A (read-only universe), B (quotes and simulation,
  no signing), C (owner-driven Agentic Wallet probe). Spec `docs/specs/F001A-spec.md` covers
  A only.

### DEC-002

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** PostgreSQL from the first commit. Production and staging: Supabase (separate
  projects, created later). Development and tests: local Postgres in Docker. CI: Postgres
  service container.

### DEC-008

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** License Apache-2.0. Copyright holder: phllp-tanstic.

### DEC-009

- **Status:** APPROVED
- **Date:** 2026-09-21
- **Decision:** Repository is public from the first commit.

## Open

### DEC-003

- **Status:** OPEN
- **Decision:** Agentic Wallet architecture.
- **Trigger:** F001-C.

### DEC-004

- **Status:** OPEN
- **Decision:** Meaning of "simulated" per execution mode, RFQ vs calldata.
- **Trigger:** F001-B.

### DEC-005

- **Status:** OPEN
- **Decision:** assetType scope, stock only vs ETF and Pre-IPO.
- **Trigger:** F001-A results.

### DEC-006

- **Status:** OPEN
- **Decision:** Deployment region and end-user eligibility gating.
- **Trigger:** before M4.

### DEC-007

- **Status:** OPEN
- **Decision:** Confirmation semantics under a ~30 s quote TTL.
- **Trigger:** before M4.
