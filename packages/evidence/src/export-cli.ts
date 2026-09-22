#!/usr/bin/env tsx
import "dotenv/config";
import { join } from "node:path";
import { createAppPool } from "./db.js";
import { exportEvidence } from "./export.js";

function parseRunId(argv: readonly string[]): string {
  const flagIndex = argv.indexOf("--run");
  const runId = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  if (!runId) {
    console.error("Usage: pnpm evidence:export --run <probe_run_id>");
    process.exit(1);
  }
  return runId;
}

async function main(): Promise<void> {
  const runId = parseRunId(process.argv.slice(2));
  const pool = createAppPool();
  try {
    const result = await exportEvidence(pool, runId, join(process.cwd(), "evidence"));
    console.warn(
      `Exported ${result.exportedCount} provider_call artifact(s) for run ${result.runId} to ${result.exportDir}; appended to ${result.manifestPath}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
