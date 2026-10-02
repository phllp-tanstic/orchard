#!/usr/bin/env tsx
import "dotenv/config";
import { execSync } from "node:child_process";
import { BinanceWeb3Client, type ProviderCallRecord, type RequestSpec } from "@orchard/binance";
import {
  createAppPool,
  openProbeRun,
  closeProbeRun,
  recordProviderCall,
  createSnapshotSink,
} from "@orchard/evidence";
import { runRwaUniverseProbe, type RequestClient } from "./pipeline.js";

/**
 * `pnpm universe:refresh` (F003 T3).
 *
 * REUSES the F001-A pipeline rather than duplicating it: the same
 * `runRwaUniverseProbe` fetches, validates and reconciles, and this CLI only
 * adds two things the probe does not do - it resolves each response's
 * evidence.provider_call id, and it passes a snapshot sink so the parsed
 * platforms and tokens are persisted to rwa.*.
 *
 * Read-only against the provider: /rwa/platforms, /rwa/tokens, /rwa/price.
 * Nothing is signed, swapped, submitted or broadcast.
 */

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

const CLIENT_VERSION = "f003-universe-refresh-0.0.0";

/** Stable key for correlating a request to the provider_call row it produced. */
function callKey(spec: RequestSpec): string {
  const query = spec.query ?? {};
  const parts = Object.keys(query)
    .sort()
    .map((k) => `${k}=${String(query[k])}`)
    .join("&");
  return `${spec.method} ${spec.path}${parts ? `?${parts}` : ""}`;
}

async function main(): Promise<void> {
  const apiKey = requireEnv("BINANCE_WEB3_API_KEY");
  const apiSecret = requireEnv("BINANCE_WEB3_API_SECRET");
  const baseUrl = requireEnv("BINANCE_WEB3_BASE_URL");
  const salt = requireEnv("EVIDENCE_REDACTION_SALT");
  const targetChainId = String(process.env["TARGET_BINANCE_CHAIN_ID"] ?? "56");
  const gitSha = resolveGitSha();

  const pool = createAppPool();
  try {
    const probeRunId = await openProbeRun(pool, { gitSha, clientVersion: CLIENT_VERSION });
    try {
      const pending: Promise<unknown>[] = [];
      /**
       * Request key -> PROMISE of its provider_call id. onCall fires
       * synchronously inside client.request, so the promise is always
       * registered before the caller resumes. Keying on the promise rather
       * than a resolved id is deliberate: the F002 route probe stored NULL
       * provider_call ids until it was fixed the same way.
       */
      const callIds = new Map<string, Promise<string | undefined>>();

      const binance = new BinanceWeb3Client({
        apiKey,
        apiSecret,
        baseUrl,
        onCall: (record: ProviderCallRecord) => {
          const write = recordProviderCall(pool, probeRunId, record, { salt }).catch(
            (err: unknown) => {
              console.error("[universe:refresh] failed to record provider_call evidence:", err);
              return undefined;
            },
          );
          pending.push(write);
          // Reconstruct the same key the wrapper below uses. `record.endpoint`
          // carries the /build prefix and the raw query string, so rebuild from
          // the request parameters instead of parsing it back.
          const query = record.requestQuery ?? {};
          const parts = Object.keys(query)
            .sort()
            .map((k) => `${k}=${String(query[k])}`)
            .join("&");
          const path = record.endpoint.replace(/^\/build/, "").split("?")[0] ?? "";
          callIds.set(`${record.method} ${path}${parts ? `?${parts}` : ""}`, write);
        },
      });

      /**
       * Thin adapter: delegates to the real client and additionally returns the
       * provider_call id for that exact response. It adds no fetching or
       * parsing of its own.
       */
      const client: RequestClient = {
        async request<T>(spec: RequestSpec): Promise<{ data: T; providerCallId?: string }> {
          const result = await binance.request<T>(spec);
          const providerCallId = await callIds.get(callKey(spec));
          return providerCallId === undefined
            ? { data: result.data }
            : { data: result.data, providerCallId };
        },
      };

      const sink = createSnapshotSink(pool, probeRunId);

      const result = await runRwaUniverseProbe({
        client,
        targetChainId,
        gitSha,
        clientVersion: CLIENT_VERSION,
        snapshot: sink,
        evidence: {
          openProbeRun: () => Promise.resolve(probeRunId),
          closeProbeRun: (args) => closeProbeRun(pool, args),
        },
      });

      await Promise.allSettled(pending);

      console.warn(
        `[universe:refresh] run ${result.probeRunId} finished with status ${result.status}: ` +
          `${sink.counts.platforms} platform rows, ${sink.counts.tokens} token rows ` +
          `(${result.report.totalRepresentations} representations, ` +
          `${result.report.uniqueUnderlyings} underlyings)` +
          (result.incompleteReasons.length > 0
            ? ` - ${result.incompleteReasons.length} incomplete reason(s)`
            : ""),
      );

      // Search reads only the latest COMPLETE run, so a run that did not reach
      // COMPLETE leaves the previous snapshot in place rather than replacing it
      // with something partial. Say so and exit non-zero.
      if (result.status !== "COMPLETE") {
        console.error(
          `[universe:refresh] status ${result.status}: the app will keep serving the previous ` +
            "COMPLETE snapshot. Reasons: " +
            result.incompleteReasons.join(" | "),
        );
        process.exitCode = 1;
      }
      if (sink.counts.tokens === 0) {
        console.error(
          "[universe:refresh] no token rows were written - nothing to search. This usually means " +
            "the provider_call id could not be resolved for the token responses.",
        );
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
