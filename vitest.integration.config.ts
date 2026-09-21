import { defineConfig } from "vitest/config";

// Integration tests require a live Postgres instance (see docker-compose.yml)
// and are never run against the real Binance API (no live provider calls in CI).
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.integration.test.ts", "tools/*/src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 30000,
    // DEC-018: one shared template database, built once here directly from
    // db/migrations (never cloned from the developer's app database), that
    // each integration test file clones its own isolated database from
    // (see packages/evidence/src/testing/isolation.ts). fileParallelism
    // stays at its default (parallel) - isolation is what makes that safe.
    globalSetup: ["./db/test-global-setup.ts"],
  },
});
