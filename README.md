# Orchard

Consumer tokenized-stock account on BNB Chain. **Buy the company. We choose the rail.**

Built for BNB Hack: Tokenized Stocks Edition.

**Status: bootstrap.** No capability is implemented or verified yet.
Control documents are in `docs/`. Agent operating rules are in `AGENTS.md`.

Licensed under [Apache-2.0](LICENSE).

## Development

pnpm workspace, TypeScript (strict), Node 20+. See `docs/specs/` for the active spec.

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Local Postgres for development/tests runs via `docker-compose.yml` (see `.env.example`).
