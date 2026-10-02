import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // apps/web resolves its own source with "@/". The test runner needs the
      // same mapping tsconfig gives the compiler.
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      // See test/stubs/server-only.ts for why, and for why this does not
      // weaken the real guarantee.
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "tools/*/src/**/*.test.ts",
      "test/**/*.test.ts",
      "db/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
