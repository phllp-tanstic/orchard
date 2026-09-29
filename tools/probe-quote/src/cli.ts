#!/usr/bin/env tsx
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BinanceWeb3Client, type ProviderCallRecord } from "@orchard/binance";
import { createAppPool, openProbeRun, closeProbeRun, recordProviderCall } from "@orchard/evidence";
import { runQuoteFeasibilityProbe } from "./pipeline.js";
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

/**
 * Read-only probe wallet (DEC-028). A well-known public BSC burn address, with
 * no private key anywhere and no balance. Confirmed live on 2026-09-29 that
 * /quote accepts it: the burn address returned a normal route, so no funded
 * address is needed and the owner's own wallet is never used here. Overridable
 * via PROBE_WALLET_ADDRESS.
 */
const DEFAULT_PROBE_WALLET_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/**
 * USDT on BSC, the spend token. This is a public contract address, not a
 * capability: the pipeline verifies it against every quote response's echoed
 * fromToken symbol/decimal and makes the run INCOMPLETE on disagreement rather
 * than trusting the constant. Confirmed live 2026-09-29 as USDT, decimal 18.
 */
const DEFAULT_SPEND_TOKEN_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const DEFAULT_SPEND_TOKEN_DECIMALS = 18;

/** Fixed default so a run is reproducible without passing anything. */
const DEFAULT_SEED = "orchard-F001B-T3";

async function main(): Promise<void> {
  // Validate all config BEFORE opening a run or touching the pool, so a
  // config error never leaves a probe_run stuck RUNNING.
  const apiKey = requireEnv("BINANCE_WEB3_API_KEY");
  const apiSecret = requireEnv("BINANCE_WEB3_API_SECRET");
  const baseUrl = requireEnv("BINANCE_WEB3_BASE_URL");
  const salt = requireEnv("EVIDENCE_REDACTION_SALT");
  const targetChainId = String(process.env["TARGET_BINANCE_CHAIN_ID"] ?? "56");
  const probeWalletAddress = process.env["PROBE_WALLET_ADDRESS"] ?? DEFAULT_PROBE_WALLET_ADDRESS;
  const spendTokenAddress = process.env["PROBE_SPEND_TOKEN_ADDRESS"] ?? DEFAULT_SPEND_TOKEN_ADDRESS;
  const spendTokenDecimals = Number(
    process.env["PROBE_SPEND_TOKEN_DECIMALS"] ?? DEFAULT_SPEND_TOKEN_DECIMALS,
  );
  const seed = process.env["PROBE_SEED"] ?? DEFAULT_SEED;
  const spendSizesUsd = (process.env["PROBE_SPEND_SIZES_USD"] ?? "10,100,1000")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const singleRepPerPlatform = Number(process.env["PROBE_SINGLE_REP_PER_PLATFORM"] ?? 10);
  const ttlObservationCount = Number(process.env["PROBE_TTL_OBSERVATIONS"] ?? 1);
  const gitSha = resolveGitSha();

  if (!Number.isInteger(spendTokenDecimals) || spendTokenDecimals < 0) {
    throw new Error(`PROBE_SPEND_TOKEN_DECIMALS must be a non-negative integer`);
  }

  const pool = createAppPool();
  try {
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
              console.error("[probe:quote] failed to record provider_call evidence:", err);
            }),
          );
        },
      });

      const result = await runQuoteFeasibilityProbe({
        client,
        targetChainId,
        gitSha,
        clientVersion: CLIENT_VERSION,
        probeWalletAddress,
        spendTokenAddress,
        spendTokenDecimals,
        spendSizesUsd,
        seed,
        singleRepPerPlatform,
        ttlObservationCount,
        evidence: {
          openProbeRun: () => Promise.resolve(probeRunId),
          closeProbeRun: (args) => closeProbeRun(pool, args),
        },
      });

      await Promise.allSettled(pendingEvidenceWrites);

      const reportsDir = join(process.cwd(), "reports");
      await mkdir(reportsDir, { recursive: true });
      await writeFile(
        join(reportsDir, "quote-feasibility.json"),
        `${JSON.stringify(result.report, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(reportsDir, "quote-feasibility.md"),
        renderMarkdown(result.report),
        "utf8",
      );

      console.warn(
        `[probe:quote] run ${result.probeRunId} finished with status ${result.status}` +
          (result.incompleteReasons.length > 0
            ? ` (${result.incompleteReasons.length} reason(s), see reports/quote-feasibility.md)`
            : ""),
      );

      if (result.status !== "COMPLETE") {
        process.exitCode = 1;
      }
    } catch (err) {
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
