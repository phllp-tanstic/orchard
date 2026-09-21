import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "tools/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
