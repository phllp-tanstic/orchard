#!/usr/bin/env tsx
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BinanceWeb3Client, type ProviderCallRecord } from "@orchard/binance";
import { createAppPool, openProbeRun, closeProbeRun, recordProviderCall } from "@orchard/evidence";
import { runRwaUniverseProbe } from "./pipeline.js";
import { renderMarkdown } from "./report.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function resolveGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    return "unknown";
  }
}

const CLIENT_VERSION = "0.0.0";

async function main(): Promise<void> {
  // Validate all required config BEFORE opening a run or touching the
  // pool, so a config error never leaves a probe_run stuck RUNNING.
  const apiKey = requireEnv("BINANCE_WEB3_API_KEY");
  const apiSecret = requireEnv("BINANCE_WEB3_API_SECRET");
  const baseUrl = requireEnv("BINANCE_WEB3_BASE_URL");
  const salt = requireEnv("EVIDENCE_REDACTION_SALT");
  const targetChainId = String(process.env["TARGET_BINANCE_CHAIN_ID"] ?? "56");
  const gitSha = resolveGitSha();

  const pool = createAppPool();
  try {
    // Opened up front (not inside the pipeline) so the client's onCall hook
    // below can attach every provider_call to this run from its first
    // request. The pipeline's own EvidenceOps.openProbeRun is a passthrough
    // that returns this same id - see the `evidence` object below.
    const probeRunId = await openProbeRun(pool, { gitSha, clientVersion: CLIENT_VERSION });

    try {
      const pendingEvidenceWrites: Promise<unknown>[] = [];
      const client = new BinanceWeb3Client({
        apiKey,
        apiSecret,
        baseUrl,
        onCall: (record: ProviderCallRecord) => {
          pendingEvidenceWrites.push(
            recordProviderCall(pool, probeRunId, record, { salt }).catch((err: unknown) => {
              console.error("[probe:rwa] failed to record provider_call evidence:", err);
            }),
          );
        },
      });

      const result = await runRwaUniverseProbe({
        client,
        targetChainId,
        gitSha,
        clientVersion: CLIENT_VERSION,
        evidence: {
          openProbeRun: () => Promise.resolve(probeRunId),
          closeProbeRun: (args) => closeProbeRun(pool, args),
        },
      });

      await Promise.allSettled(pendingEvidenceWrites);

      const reportsDir = join(process.cwd(), "reports");
      await mkdir(reportsDir, { recursive: true });
      await writeFile(
        join(reportsDir, "rwa-universe.json"),
        `${JSON.stringify(result.report, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(reportsDir, "rwa-universe.md"), renderMarkdown(result.report), "utf8");

      console.warn(
        `[probe:rwa] run ${result.probeRunId} finished with status ${result.status}` +
          (result.incompleteReasons.length > 0
            ? ` (${result.incompleteReasons.length} reason(s), see reports/rwa-universe.md)`
            : ""),
      );

      if (result.status !== "COMPLETE") {
        process.exitCode = 1;
      }
    } catch (err) {
      // Anything unexpected between opening the run and the pipeline's own
      // closeProbeRun call (e.g. client construction failing) must still
      // close the run - never leave it stuck RUNNING.
      const message = err instanceof Error ? err.message : String(err);
      await closeProbeRun(pool, { probeRunId, status: "FAILED", incompleteReasons: [message] });
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
