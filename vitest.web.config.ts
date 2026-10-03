import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Component tests for apps/web (F003 T5). A SEPARATE project from the root
 * config because these need a DOM; the root config stays `environment: node`
 * so server and library tests are not slowed down or given browser globals
 * they should not have.
 *
 * Run by `pnpm test:web`. The root `pnpm test` also picks up
 * apps/web/src/**\/*.test.ts (node-side server tests); only *.dom.test.tsx
 * files belong here.
 *
 * JSX is compiled by Vite's own esbuild with the automatic runtime rather than
 * by @vitejs/plugin-react: that plugin brings a second, older Vite into the
 * workspace, and the two resolve React differently. Fast Refresh is a dev-server
 * feature these tests never use, so the plugin buys nothing here.
 */
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      // See test/stubs/server-only.ts. Components import server types with
      // `import type`, so this should never be reached - it is here so a stray
      // value import fails as a test assertion rather than as a resolver error.
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["apps/web/src/**/*.dom.test.tsx"],
    exclude: ["**/node_modules/**"],
    environment: "jsdom",
    globals: false,
  },
});
