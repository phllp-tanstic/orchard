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

### Migrations

```
pnpm migrate:up                  # apply every pending migration
pnpm migrate:down 1              # roll back exactly N migrations (count REQUIRED)
pnpm migrate:reset -- --confirm <databaseName>   # roll back EVERYTHING
```

`pnpm migrate:down` with **no count is refused.** It used to default to "all", which rolled
back every migration and emptied a local evidence database when the operator believed it
stepped back one. The count is now mandatory, and rolling everything back has its own verb.

Rolling back needs `ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1`. `migrate:reset` additionally needs
`ORCHARD_ALLOW_FULL_RESET=1` and the database name typed back — it must match what
`DATABASE_URL` points at, so a reset cannot be pasted from another terminal onto the wrong
database. Before rolling anything back it prints the database name and the row counts of every
evidence table, because "0 rows" and "488 rows" deserve different answers.

The evidence store is append-only by design. A reset destroys stored observations that cannot
be re-derived; a refresh re-fetches only what the provider still returns today.

### Web app

```
pnpm web:build   # next build, then the client-bundle secret scan (fails the build on a leak)
pnpm web:dev     # http://localhost:3000, reads the repo-root .env
pnpm test:web    # component tests (jsdom)
pnpm test:e2e:stub   # browser tests that make no provider call - also run in CI
pnpm test:e2e:live   # browser tests against the real provider - owner-run, local only
```
