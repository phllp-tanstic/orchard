import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectSecretValues, formatFindings, scanClientBundle } from "./bundle-scan.js";

/**
 * Post-build client-bundle scan (F003 hardening item 4).
 *
 * Wired into apps/web's own `build` script, so it runs on EVERY path that
 * builds this app - `pnpm web:build`, `pnpm --filter @orchard/web build`, or a
 * host running the package's build script directly. A leak therefore fails the
 * build itself rather than waiting for a test job that a host will not run.
 *
 * Exit code 1 on any finding. Secret values are never printed; a finding names
 * the variable, because this output goes into build logs.
 *
 * fileURLToPath, not a raw URL pathname: a percent-encoded Windows path with a
 * space would make the directory walk return nothing and the scan pass
 * vacuously. The "no files scanned" check below is the backstop for that.
 */
const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const NEXT_DIR = join(WEB_ROOT, ".next");
const CLIENT_DIR = join(NEXT_DIR, "static");

function main(): void {
  if (!existsSync(CLIENT_DIR)) {
    console.error(
      `client bundle scan: ${CLIENT_DIR} does not exist. Run the build before scanning.`,
    );
    process.exit(1);
  }

  // The root .env is optional by design: a host injects the environment
  // instead, and process.env is where the values are in that case.
  const envPath = join(REPO_ROOT, ".env");
  const envFileContents = existsSync(envPath) ? readFileSync(envPath, "utf8") : undefined;
  const secretValues = collectSecretValues({ env: process.env, envFileContents });

  const result = scanClientBundle({
    dirs: [CLIENT_DIR],
    secretValues,
    displayRoot: WEB_ROOT,
  });

  if (result.filesScanned === 0) {
    // A scan of zero files reports "no findings", which is indistinguishable
    // from a clean bundle. Treat it as a failure rather than a pass.
    console.error("client bundle scan: scanned 0 files, which cannot be right. Failing closed.");
    process.exit(1);
  }

  const report = formatFindings(result);
  if (result.findings.length > 0) {
    console.error(report);
    process.exit(1);
  }
  console.warn(report);
}

main();
