#!/usr/bin/env tsx
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BinanceWeb3Client,
  buildQuoteRequest,
  quoteDataSchema,
  BinanceApiError,
  type ProviderCallRecord,
} from "@orchard/binance";
import { createAppPool, openProbeRun, closeProbeRun, recordProviderCall } from "@orchard/evidence";
import {
  defaultPolicy,
  persistRun,
  USDT_BSC,
  type QuoteResult,
  type RepresentationInput,
} from "@orchard/execution";
import { partitionCompleteTokens, tokensDataSchema, type Token } from "@orchard/rwa";
import { pricesDataSchema } from "@orchard/rwa";
import { runRouteProbe } from "./pipeline.js";
import { renderMarkdown, type TickerResult } from "./report.js";

/**
 * `pnpm route:probe --ticker NVDA --amount 100`, or `--batch` for every
 * multi-representation ticker (F002 T5).
 *
 * Read-only: /rwa/tokens, /rwa/price and /quote. It never calls /swap,
 * /order/submit or broadcast, and it never signs. The wallet address is a
 * public burn address used only to construct a quote.
 */

const PLATFORM_IDS = ["ondo", "bstock"] as const;
const PRICE_BATCH = 80; // DEC-024: 100 trips HTTP 414
const DEFAULT_PROBE_WALLET = "0x000000000000000000000000000000000000dEaD";
const CLIENT_VERSION = "f002-route-probe-0.0.0";

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

interface Args {
  tickers?: string[];
  amount: string;
  batch: boolean;
}

function parseArgs(argv: string[]): Args {
  let amount = "100";
  const tickers: string[] = [];
  let batch = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ticker") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error("--ticker requires a value");
      tickers.push(v.toUpperCase());
      i += 1;
    } else if (arg === "--amount") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error("--amount requires a value");
      amount = v;
      i += 1;
    } else if (arg === "--batch") {
      batch = true;
    } else if (arg === "--") {
      // pnpm forwards the bare "--" separator from `pnpm route:probe -- --ticker X`.
      // It is not a flag; ignore it rather than failing a documented invocation.
      continue;
    } else if (arg !== undefined && arg.startsWith("--")) {
      throw new Error(`unknown flag ${arg}`);
    }
  }
  if (!batch && tickers.length === 0) {
    throw new Error("pass --ticker <SYMBOL> (repeatable) or --batch");
  }
  return { amount, batch, ...(batch ? {} : { tickers }) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = requireEnv("BINANCE_WEB3_API_KEY");
  const apiSecret = requireEnv("BINANCE_WEB3_API_SECRET");
  const baseUrl = requireEnv("BINANCE_WEB3_BASE_URL");
  const salt = requireEnv("EVIDENCE_REDACTION_SALT");
  const targetChainId = String(process.env["TARGET_BINANCE_CHAIN_ID"] ?? "56");
  const probeWalletAddress = process.env["PROBE_WALLET_ADDRESS"] ?? DEFAULT_PROBE_WALLET;
  const gitSha = resolveGitSha();

  const policy = defaultPolicy({
    spendAsset: {
      ...USDT_BSC,
      tokenContractAddress:
        process.env["PROBE_SPEND_TOKEN_ADDRESS"] ?? USDT_BSC.tokenContractAddress,
      decimals: Number(process.env["PROBE_SPEND_TOKEN_DECIMALS"] ?? USDT_BSC.decimals),
    },
    ...(process.env["PROBE_MAX_QUOTE_AGE_SECONDS"] !== undefined
      ? { maxQuoteAgeSeconds: Number(process.env["PROBE_MAX_QUOTE_AGE_SECONDS"]) }
      : {}),
    ...(process.env["PROBE_MAX_PRICE_IMPACT_BPS"] !== undefined
      ? { maxPriceImpactBps: process.env["PROBE_MAX_PRICE_IMPACT_BPS"] }
      : {}),
  });

  const pool = createAppPool();
  try {
    const probeRunId = await openProbeRun(pool, { gitSha, clientVersion: CLIENT_VERSION });
    const pendingEvidence: Promise<unknown>[] = [];
    /**
     * Maps a quoted token address to the PROMISE of its provider_call row id.
     * onCall fires synchronously inside client.request, so the promise is
     * always registered before the caller resumes; awaiting it is what makes
     * the candidate-to-evidence link reliable. Keying on the promise rather
     * than the resolved id was the bug: the first live run stored NULL
     * provider_call_id because the insert had not finished yet.
     */
    const callIdByToken = new Map<string, Promise<string | undefined>>();

    const client = new BinanceWeb3Client({
      apiKey,
      apiSecret,
      baseUrl,
      onCall: (record: ProviderCallRecord) => {
        const write = recordProviderCall(pool, probeRunId, record, { salt }).catch(
          (err: unknown) => {
            console.error("[route:probe] failed to record provider_call evidence:", err);
            return undefined;
          },
        );
        pendingEvidence.push(write);
        const to = record.requestQuery?.["toTokenAddress"];
        if (typeof to === "string") callIdByToken.set(to.toLowerCase(), write);
      },
    });

    try {
      // --- representation universe, live, through F001-A's own code path
      const tokens: Token[] = [];
      for (const platformId of PLATFORM_IDS) {
        const raw = (
          await client.request<unknown>({
            method: "GET",
            path: "/api/v1/dex/market/rwa/tokens",
            query: { binanceChainId: targetChainId, platformId },
          })
        ).data;
        tokens.push(...tokensDataSchema.parse(raw));
      }

      // --- per-share benchmarks from /rwa/price referencePrice (Amendment A1)
      const perShare = new Map<string, string>();
      const addrs = [...new Set(tokens.map((t) => t.tokenContractAddress))];
      for (let i = 0; i < addrs.length; i += PRICE_BATCH) {
        const batch = addrs.slice(i, i + PRICE_BATCH);
        const raw = (
          await client.request<unknown>({
            method: "GET",
            path: "/api/v1/dex/market/rwa/price",
            query: { binanceChainId: targetChainId, tokenContractAddresses: batch.join(",") },
          })
        ).data;
        for (const p of pricesDataSchema.parse(raw)) {
          perShare.set(p.tokenContractAddress.toLowerCase(), p.referencePrice);
        }
      }

      // DEC-020's three null-identity tokens are kept as candidates so the
      // report rejects them explicitly with NULL_IDENTITY rather than hiding them.
      const { complete, incomplete } = partitionCompleteTokens(tokens);
      const representations: RepresentationInput[] = [
        ...complete.map((t) => toRepresentation(t, perShare)),
        ...tokens
          .filter((t) => incomplete.some((i) => i.tokenContractAddress === t.tokenContractAddress))
          .map((t) => toRepresentation(t, perShare)),
      ];

      const report = await runRouteProbe(
        {
          ...(args.batch ? {} : { tickers: args.tickers }),
          spendAmountDecimal: args.amount,
          policy,
          targetChainId,
          probeWalletAddress,
          gitSha,
          probeRunId,
        },
        {
          resolveAll: () => Promise.resolve(representations),
          quote: async (representation, spendSmallestUnit): Promise<QuoteResult> => {
            const quotedAt = new Date();
            try {
              const res = await client.request<unknown>(
                buildQuoteRequest({
                  binanceChainId: representation.binanceChainId,
                  amount: spendSmallestUnit,
                  fromTokenAddress: policy.spendAsset.tokenContractAddress,
                  toTokenAddress: representation.tokenContractAddress,
                  userWalletAddress: probeWalletAddress,
                }),
              );
              const routes = quoteDataSchema.parse(res.data);
              const best = routes.find((r) => r.isBest === true) ?? routes[0];
              // Await this token's own evidence insert so the candidate carries a
              // real provider_call_id rather than NULL (F002 T4).
              const providerCallId = await callIdByToken.get(
                representation.tokenContractAddress.toLowerCase(),
              );
              if (best === undefined) {
                return { quotedAt, ...(providerCallId !== undefined ? { providerCallId } : {}) };
              }
              return {
                quotedAt,
                ...(providerCallId !== undefined ? { providerCallId } : {}),
                route: {
                  quoteId: best.quoteId,
                  toTokenAmount: best.toTokenAmount,
                  toTokenDecimal: best.toToken?.decimal,
                  tradeFee: best.tradeFee,
                  estimateGasFee: best.estimateGasFee,
                  priceImpactPercent: best.priceImpactPercent,
                  executionMode: best.executionMode,
                  vendorName: best.vendorName,
                },
              };
            } catch (err) {
              if (err instanceof BinanceApiError) return { quotedAt, providerCode: err.code };
              return { quotedAt, error: err instanceof Error ? err.message : String(err) };
            }
          },
          persist: async (result: TickerResult): Promise<string> => {
            await Promise.allSettled(pendingEvidence);
            const persisted = await persistRun(pool, {
              probeRunId,
              result: {
                intentId: result.decision.intentId,
                request: {
                  underlyingTicker: result.underlyingTicker,
                  spendAmountDecimal: result.spendAmountDecimal,
                  policy,
                  targetChainId,
                },
                spendAmountSmallestUnit: result.spendAmountSmallestUnit,
                candidates: result.candidates,
                ranked: result.candidates.filter((c) => c.eligibility === "ELIGIBLE"),
                decision: result.decision,
              },
            });
            return persisted.executionRequestId;
          },
        },
      );

      await Promise.allSettled(pendingEvidence);

      const reportsDir = join(process.cwd(), "reports");
      await mkdir(reportsDir, { recursive: true });
      await writeFile(
        join(reportsDir, "route-probe.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(reportsDir, "route-probe.md"), renderMarkdown(report), "utf8");

      console.warn(
        `[route:probe] run ${probeRunId} finished with status ${report.status}` +
          (report.incompleteReasons.length > 0
            ? ` (${report.incompleteReasons.length} reason(s), see reports/route-probe.md)`
            : ""),
      );
      await closeProbeRun(pool, {
        probeRunId,
        status: report.status,
        ...(report.incompleteReasons.length > 0
          ? { incompleteReasons: report.incompleteReasons }
          : {}),
      });
      if (report.status !== "COMPLETE") process.exitCode = 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await closeProbeRun(pool, { probeRunId, status: "FAILED", incompleteReasons: [message] });
      throw err;
    }
  } finally {
    await pool.end();
  }
}

/** RWA token to engine input, attaching the per-share benchmark when known. */
function toRepresentation(token: Token, perShare: Map<string, string>): RepresentationInput {
  const bench = perShare.get(token.tokenContractAddress.toLowerCase());
  return {
    platformId: token.platformId,
    underlyingTicker: token.underlyingTicker,
    tokenSymbol: token.tokenSymbol,
    tokenContractAddress: token.tokenContractAddress,
    binanceChainId: token.binanceChainId,
    assetType: token.assetType,
    underlyingName: token.underlyingName,
    tokenToShareRatio: token.tokenToShareRatio,
    decimals: token.decimals,
    ...(bench !== undefined ? { perSharePrice: bench } : {}),
  };
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
