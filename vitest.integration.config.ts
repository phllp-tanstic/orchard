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
  },
});
