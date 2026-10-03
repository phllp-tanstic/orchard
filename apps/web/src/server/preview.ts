import "server-only";
import type { Pool } from "pg";
import {
  BinanceApiError,
  BinanceWeb3Client,
  buildQuoteRequest,
  quoteDataSchema,
  type ProviderCallRecord,
} from "@orchard/binance";
import { openProbeRun, closeProbeRun, recordProviderCall } from "@orchard/evidence";
import {
  defaultPolicy,
  persistRun,
  runBestExecution,
  USDT_BSC,
  type EligibilityPolicy,
  type QuoteResult,
  type RepresentationInput,
} from "@orchard/execution";
import { pricesDataSchema } from "@orchard/rwa";
import { serverEnv } from "./env";
import { buildPreviewDto, type PreviewDto } from "./dto";
import { findUnderlying, representationsOf } from "./universe";

/**
 * The preview service (F003 T2). Calls the F002 engine with the default
 * policy and maps the result to a UI-safe DTO.
 *
 * Read-only: /rwa/price for the per-share benchmark and /quote per
 * representation. It never calls /swap, /order/submit or broadcast, and it
 * never signs. The wallet address is a public burn address used only to shape
 * a quote request.
 *
 * Every provider call is recorded as evidence, and every run persists its
 * execution_request, candidate_route and route_decision rows, so what the
 * screen shows can always be reconciled against the database.
 */

const CLIENT_VERSION = "f003-web-preview-0.0.0";

export class ProviderUnavailableError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class UnknownTickerError extends Error {
  readonly code = "NOT_FOUND";
  constructor(ticker: string) {
    super(`no supported representation for ${ticker}`);
    this.name = "UnknownTickerError";
  }
}

/**
 * The engine's default policy, unmodified. F003 T2 says "the default policy",
 * so the web app deliberately does NOT invent its own thresholds: asset types
 * Stock and ETF (DEC-005), max quote age 20s (DEC-036), max price impact
 * 300 bps, max reference deviation 500 bps (DEC-038).
 */
export function previewPolicy(): EligibilityPolicy {
  return defaultPolicy({ spendAsset: { ...USDT_BSC } });
}

function providerClient(onCall: (record: ProviderCallRecord) => void): BinanceWeb3Client {
  const env = serverEnv();
  return new BinanceWeb3Client({
    apiKey: env.BINANCE_WEB3_API_KEY,
    apiSecret: env.BINANCE_WEB3_API_SECRET,
    baseUrl: env.BINANCE_WEB3_BASE_URL,
    onCall,
  });
}

export interface RunPreviewArgs {
  pool: Pool;
  ticker: string;
  amount: string;
  gitSha?: string;
}

/**
 * Runs one preview end to end. Throws UnknownTickerError when the ticker is
 * not in the snapshot, and ProviderUnavailableError only when the provider
 * could not be reached at all - a provider that answers with a rejection for
 * some representations is a normal NO_ELIGIBLE_ROUTE outcome, not an error.
 */
export async function runPreview(args: RunPreviewArgs): Promise<PreviewDto> {
  const env = serverEnv();
  const policy = previewPolicy();
  const targetChainId = env.TARGET_BINANCE_CHAIN_ID;

  const underlying = await findUnderlying(args.pool, args.ticker);
  if (underlying === undefined) throw new UnknownTickerError(args.ticker);
  const stored = await representationsOf(args.pool, args.ticker);
  if (stored.length === 0) throw new UnknownTickerError(args.ticker);

  const probeRunId = await openProbeRun(args.pool, {
    gitSha: args.gitSha ?? "web",
    clientVersion: CLIENT_VERSION,
  });

  const pending: Promise<unknown>[] = [];
  /** Quoted token address -> promise of its provider_call id. */
  const callIdByToken = new Map<string, Promise<string | undefined>>();

  const client = providerClient((record) => {
    const write = recordProviderCall(args.pool, probeRunId, record, {
      salt: env.EVIDENCE_REDACTION_SALT,
    }).catch(() => undefined);
    pending.push(write);
    const to = record.requestQuery?.["toTokenAddress"];
    if (typeof to === "string") callIdByToken.set(to.toLowerCase(), write);
  });

  try {
    // --- per-share benchmark for exactly these representations.
    // /rwa/price referencePrice is the ONLY per-share field (Amendment A1).
    const perShare = new Map<string, string>();
    try {
      const raw = (
        await client.request<unknown>({
          method: "GET",
          path: "/api/v1/dex/market/rwa/price",
          query: {
            binanceChainId: targetChainId,
            tokenContractAddresses: stored.map((s) => s.tokenContractAddress).join(","),
          },
        })
      ).data;
      for (const p of pricesDataSchema.parse(raw)) {
        perShare.set(p.tokenContractAddress.toLowerCase(), p.referencePrice);
      }
    } catch {
      // A missing benchmark is NOT fatal: DEC-037 keeps such a candidate
      // eligible and flags it REFERENCE_UNAVAILABLE so the UI shows that the
      // check could not run, rather than reading a missing benchmark as a
      // perfect zero deviation. Whether the provider is reachable at all is
      // decided by the quote calls below, which share this client.
    }

    const representations: RepresentationInput[] = stored.map((s) => {
      const bench = perShare.get(s.tokenContractAddress.toLowerCase());
      return {
        platformId: s.platformId,
        underlyingTicker: underlying.ticker,
        tokenSymbol: s.tokenSymbol,
        tokenContractAddress: s.tokenContractAddress,
        binanceChainId: s.binanceChainId,
        assetType: underlying.assetType,
        underlyingName: underlying.companyName,
        tokenToShareRatio: s.tokenToShareRatio,
        // The provider's own decimals from the stored snapshot. The engine
        // prefers the quote's echoed toToken.decimal when present and falls
        // back to this; neither is a guess.
        decimals: s.tokenDecimals,
        ...(bench !== undefined ? { perSharePrice: bench } : {}),
      };
    });

    let providerReachable = false;
    const result = await runBestExecution(
      {
        underlyingTicker: underlying.ticker,
        spendAmountDecimal: args.amount,
        policy,
        targetChainId,
      },
      {
        resolveRepresentations: () => Promise.resolve(representations),
        quote: async (representation, spendSmallestUnit): Promise<QuoteResult> => {
          const quotedAt = new Date();
          try {
            const res = await client.request<unknown>(
              buildQuoteRequest({
                binanceChainId: representation.binanceChainId,
                amount: spendSmallestUnit,
                fromTokenAddress: policy.spendAsset.tokenContractAddress,
                toTokenAddress: representation.tokenContractAddress,
                userWalletAddress: env.PROBE_WALLET_ADDRESS,
              }),
            );
            providerReachable = true;
            const routes = quoteDataSchema.parse(res.data);
            const best = routes.find((r) => r.isBest === true) ?? routes[0];
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
            if (err instanceof BinanceApiError) {
              // The provider answered, it just rejected this route. That is a
              // normal per-candidate outcome, not an outage.
              providerReachable = true;
              return { quotedAt, providerCode: err.code };
            }
            return { quotedAt, error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
    );

    await Promise.allSettled(pending);

    if (!providerReachable) {
      await closeProbeRun(args.pool, {
        probeRunId,
        status: "FAILED",
        incompleteReasons: ["provider unreachable for every representation"],
      });
      throw new ProviderUnavailableError("the pricing provider could not be reached");
    }

    let executionRequestId: string | undefined;
    try {
      const persisted = await persistRun(args.pool, { probeRunId, result });
      executionRequestId = persisted.executionRequestId;
    } catch {
      // A persistence failure must not turn a correct preview into a lie or an
      // error: the screen still shows what the engine decided, just without a
      // reconcilable id.
      executionRequestId = undefined;
    }

    await closeProbeRun(args.pool, {
      probeRunId,
      status: result.decision.outcome === "SELECTED" ? "COMPLETE" : "INCOMPLETE",
      ...(result.decision.outcome === "SELECTED"
        ? {}
        : { incompleteReasons: result.decision.reasonCodes }),
    });

    return buildPreviewDto({
      ticker: underlying.ticker,
      companyName: underlying.companyName,
      assetTypeLabel: underlying.assetTypeLabel,
      amount: args.amount,
      spendAssetSymbol: policy.spendAsset.symbol,
      maxQuoteAgeSeconds: policy.maxQuoteAgeSeconds,
      candidates: result.candidates,
      decision: result.decision,
      ...(executionRequestId !== undefined ? { executionRequestId } : {}),
    });
  } catch (err) {
    if (err instanceof ProviderUnavailableError || err instanceof UnknownTickerError) throw err;
    await closeProbeRun(args.pool, {
      probeRunId,
      status: "FAILED",
      incompleteReasons: [err instanceof Error ? err.message : String(err)],
    }).catch(() => undefined);
    throw err;
  }
}
