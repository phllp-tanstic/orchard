import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

/**
 * Browser end-to-end tests for apps/web (F003 T5).
 *
 * These run LOCALLY, by the owner, against the real provider and the real
 * evidence store - AGENTS.md forbids live provider calls in CI, so `pnpm
 * test:e2e` is deliberately NOT a CI step. CI builds the app, scans the client
 * bundle for secrets and runs the component tests instead.
 *
 * `workers: 1` is not a performance choice. The rate limiter and the
 * concurrency budget are in-process and F003 section 4 assumes exactly one
 * server instance; parallel workers would race each other through the same
 * provider budget and make a BUSY response look like a flaky test.
 */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// The server needs the same credentials the CLIs use. They are read from the
// repo-root .env and passed to the child process; nothing is logged.
loadEnv({ path: `${repoRoot}.env`, quiet: true });

const PORT = Number(process.env["ORCHARD_WEB_E2E_PORT"] ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // A live preview is several provider calls deep, so these are generous.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The spec asks for a mobile viewport check; this runs the same specs at
    // phone width rather than asserting responsiveness in the abstract.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // `next start`, not `next dev`: the production build is what the bundle
    // scan inspects and what deployment would run.
    command: `pnpm --filter @orchard/web exec next start --port ${PORT} --hostname 127.0.0.1`,
    cwd: repoRoot,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
