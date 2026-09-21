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
    // DEC-017: one shared template database, built once here, that each
    // integration test file clones its own isolated database from (see
    // packages/evidence/src/testing/isolation.ts). fileParallelism stays at
    // its default (parallel) - isolation is what makes that safe.
    globalSetup: ["./packages/evidence/src/testing/global-setup.ts"],
  },
});
