import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

/**
 * Browser end-to-end tests for apps/web (F003 T5, split in hardening item 6).
 *
 * The suite is divided by TAG, and the split is about live provider calls:
 *
 *  - `@stub` tests make no provider call. They either stub the /api/previews
 *    response inside the browser, or exercise endpoints and pages that read
 *    only the database and the local configuration. These run in CI, against
 *    a synthetic universe seed and a provider base URL that goes nowhere.
 *  - `@live` tests drive the real provider. They are OWNER-RUN, locally, only:
 *    AGENTS.md forbids live provider calls in CI.
 *
 * `pnpm test:e2e:stub` runs the CI subset, `pnpm test:e2e:live` the rest, and
 * `pnpm test:e2e` runs everything (which needs real credentials).
 *
 * `workers: 1` is not a performance choice. The rate limiter and the
 * concurrency budget are in-process and F003 section 4 assumes exactly one
 * server instance; parallel workers would race each other through the same
 * budget and make a rate-limited or BUSY response look like a flaky test.
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
    // /api/live, not /api/health: readiness answers 503 when the provider is
    // unreachable, which is the normal and correct state in the CI stub run.
    // Waiting on it there would hang until the timeout.
    url: `${baseURL}/api/live`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
