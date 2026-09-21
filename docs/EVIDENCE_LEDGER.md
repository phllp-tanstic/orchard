# Evidence Ledger

**Status: bootstrap.** No evidence has been captured yet.

Raw provider payloads stay in `evidence/raw/` (git-ignored, never committed). Redacted
artifacts exported via `pnpm evidence:export` land in `evidence/export/<sha256>.json` and are
indexed in `evidence/manifest.jsonl`. The owner reviews and commits both by hand (`AGENTS.md`).

This file tracks, at a glance, which probe runs have owner-reviewed evidence committed.

| Probe run id | Date | Reviewed by owner | Manifest entries | Notes |
| ------------ | ---- | ----------------- | ---------------- | ----- |
| _none yet_   |      |                   |                  |       |
