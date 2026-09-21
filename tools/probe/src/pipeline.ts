import { Decimal } from "decimal.js";
import {
  platformsDataSchema,
  platformSchema,
  tokensDataSchema,
  tokenSchema,
  pricesDataSchema,
  priceSchema,
  underlyingProfileDataSchema,
  unknownArrayItemKeys,
  unknownObjectKeys,
  parseDecimal,
  bpsDifference,
  groupByUnderlyingTicker,
  multiRepresentationTickers,
  toRepresentation,
  summarizeBps,
  classifyReferencePrice,
  ASSET_TYPE_LABEL,
  PRICE_BATCH_MAX,
  type Platform,
  type PriceQuote,
  type TokenRepresentation,
} from "@orchard/rwa";
import type {
  RatioAnomaly,
  ReconciliationEntry,
  RwaUniverseReport,
  StalenessEntry,
} from "./report.js";

export interface RequestSpec {
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface RequestClient {
  request<T>(spec: RequestSpec): Promise<{ data: T }>;
}

export type TerminalStatus = "COMPLETE" | "INCOMPLETE" | "FAILED";

export interface EvidenceOps {
  openProbeRun(args: { gitSha: string; clientVersion: string }): Promise<string>;
  closeProbeRun(args: {
    probeRunId: string;
    status: TerminalStatus;
    incompleteReasons?: readonly string[];
  }): Promise<void>;
}

export interface RunProbeDeps {
  client: RequestClient;
  evidence: EvidenceOps;
  gitSha: string;
  clientVersion: string;
  targetChainId: string;
  now?: () => Date;
}

export interface RunProbeResult {
  probeRunId: string;
  status: TerminalStatus;
  incompleteReasons: string[];
  report: RwaUniverseReport;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * `pnpm probe:rwa` pipeline (spec T4). Every phase is wrapped so a failure
 * is recorded as an incompleteReason rather than crashing the whole run -
 * except platforms itself, whose failure means there is nothing to report
 * on at all, so the run is marked FAILED outright (spec T4/acceptance: an
 * unreachable/unauthorized endpoint must produce FAILED or INCOMPLETE, never
 * a report claiming completeness).
 */
export async function runRwaUniverseProbe(deps: RunProbeDeps): Promise<RunProbeResult> {
  const now = deps.now ?? ((): Date => new Date());
  const probeRunId = await deps.evidence.openProbeRun({
    gitSha: deps.gitSha,
    clientVersion: deps.clientVersion,
  });

  const reasons: string[] = [];
  const unknownFields: Record<string, string[]> = {};

  let platforms: Platform[];
  try {
    const raw = (
      await deps.client.request<unknown>({
        method: "GET",
        path: "/api/v1/dex/market/rwa/platforms",
      })
    ).data;
    platforms = platformsDataSchema.parse(raw);
    const extra = unknownArrayItemKeys(platformSchema.shape, raw as Record<string, unknown>[]);
    if (extra.length) unknownFields["platforms"] = extra;
  } catch (err) {
    const reason = `failed to fetch/validate platforms: ${describeError(err)}`;
    const failedReport = emptyReport(probeRunId, deps.gitSha, now(), "FAILED", [reason]);
    await deps.evidence.closeProbeRun({ probeRunId, status: "FAILED", incompleteReasons: [reason] });
    return { probeRunId, status: "FAILED", incompleteReasons: [reason], report: failedReport };
  }

  const representations: TokenRepresentation[] = [];
  const reconciliation: ReconciliationEntry[] = [];
  const platformCounts: Record<string, number> = {};

  for (const platform of platforms) {
    try {
      const raw = (
        await deps.client.request<unknown>({
          method: "GET",
          path: "/api/v1/dex/market/rwa/tokens",
          query: { binanceChainId: deps.targetChainId, platformId: platform.platformId },
        })
      ).data;
      const tokens = tokensDataSchema.parse(raw);
      const extra = unknownArrayItemKeys(tokenSchema.shape, raw as Record<string, unknown>[]);
      if (extra.length) unknownFields[`tokens:${platform.platformId}`] = extra;

      const reps = tokens.map(toRepresentation);
      representations.push(...reps);
      platformCounts[platform.platformId] = reps.length;

      const chainEntry = platform.chainDistribution.find(
        (c) => c.binanceChainId === deps.targetChainId,
      );
      const ok = chainEntry !== undefined && chainEntry.tokenCount === reps.length;
      reconciliation.push({
        platformId: platform.platformId,
        targetChainId: deps.targetChainId,
        reportedTokenCount: chainEntry?.tokenCount,
        actualTokenCount: reps.length,
        ok,
      });
      if (!ok) {
        reasons.push(
          `reconciliation mismatch for platform ${platform.platformId}: platform reports ${
            chainEntry?.tokenCount ?? "no chain-56 entry"
          } tokens for chain ${deps.targetChainId}, but ${reps.length} were fetched - universe untrusted`,
        );
      }
    } catch (err) {
      reasons.push(
        `failed to fetch/validate tokens for platform ${platform.platformId}: ${describeError(err)}`,
      );
    }
  }

  const groups = groupByUnderlyingTicker(representations);
  const multiRepTickers = multiRepresentationTickers(groups);

  const ratioAnomalies: RatioAnomaly[] = [];
  for (const ticker of multiRepTickers) {
    const group = groups.get(ticker);
    if (!group) continue;
    for (const rep of group.representations) {
      try {
        const raw = (
          await deps.client.request<unknown>({
            method: "GET",
            path: "/api/v1/dex/market/rwa/underlying-profile",
            query: {
              binanceChainId: rep.binanceChainId,
              tokenContractAddress: rep.tokenContractAddress,
            },
          })
        ).data;
        const profile = underlyingProfileDataSchema.parse(raw);
        const extra = unknownObjectKeys(
          underlyingProfileDataSchema.shape,
          raw as Record<string, unknown>,
        );
        if (extra.length) {
          unknownFields[`underlying-profile:${rep.binanceChainId}:${rep.tokenContractAddress}`] =
            extra;
        }

        if (!parseDecimal(profile.tokenToShareRatio).equals(parseDecimal(rep.tokenToShareRatio))) {
          ratioAnomalies.push({
            underlyingTicker: ticker,
            binanceChainId: rep.binanceChainId,
            tokenContractAddress: rep.tokenContractAddress,
            listRatio: rep.tokenToShareRatio,
            profileRatio: profile.tokenToShareRatio,
          });
        }
      } catch (err) {
        reasons.push(
          `failed to fetch/validate underlying-profile for ${rep.binanceChainId}:${rep.tokenContractAddress}: ${describeError(err)}`,
        );
      }
    }
  }

  const byChain = new Map<string, TokenRepresentation[]>();
  for (const rep of representations) {
    const list = byChain.get(rep.binanceChainId) ?? [];
    list.push(rep);
    byChain.set(rep.binanceChainId, list);
  }

  const priceByKey = new Map<string, PriceQuote>();
  for (const [chainId, reps] of byChain) {
    for (let i = 0; i < reps.length; i += PRICE_BATCH_MAX) {
      const batch = reps.slice(i, i + PRICE_BATCH_MAX);
      try {
        const raw = (
          await deps.client.request<unknown>({
            method: "GET",
            path: "/api/v1/dex/market/rwa/price",
            query: {
              binanceChainId: chainId,
              tokenContractAddresses: batch.map((r) => r.tokenContractAddress).join(","),
            },
          })
        ).data;
        const prices = pricesDataSchema.parse(raw);
        const extra = unknownArrayItemKeys(priceSchema.shape, raw as Record<string, unknown>[]);
        if (extra.length) unknownFields[`price:${chainId}:${i / PRICE_BATCH_MAX}`] = extra;
        for (const p of prices) priceByKey.set(`${p.binanceChainId}:${p.tokenContractAddress}`, p);
      } catch (err) {
        reasons.push(`failed to fetch/validate price batch for chain ${chainId}: ${describeError(err)}`);
      }
    }
  }

  const staleness: StalenessEntry[] = [];
  const bpsVsTokenPrice: Decimal[] = [];
  const bpsVsImplied: Decimal[] = [];
  for (const rep of representations) {
    const price = priceByKey.get(`${rep.binanceChainId}:${rep.tokenContractAddress}`);
    if (!price) continue;

    const ageSeconds = Math.round((now().getTime() - price.tokenPriceUpdatedAt) / 1000);
    staleness.push({
      binanceChainId: rep.binanceChainId,
      tokenContractAddress: rep.tokenContractAddress,
      tokenPriceUpdatedAt: new Date(price.tokenPriceUpdatedAt).toISOString(),
      ageSeconds,
    });

    const reference = parseDecimal(price.referencePrice);
    const tokenPrice = parseDecimal(price.tokenPrice);
    const dVsTokenPrice = bpsDifference(reference, tokenPrice);
    const dVsImplied = bpsDifference(reference, rep.impliedPricePerShare);
    if (dVsTokenPrice !== undefined) bpsVsTokenPrice.push(dVsTokenPrice);
    if (dVsImplied !== undefined) bpsVsImplied.push(dVsImplied);
  }

  const vsTokenPriceBps = summarizeBps(bpsVsTokenPrice);
  const vsImpliedPricePerShareBps = summarizeBps(bpsVsImplied);
  const referencePriceAnalysis = {
    vsTokenPriceBps,
    vsImpliedPricePerShareBps,
    verdict: classifyReferencePrice(vsTokenPriceBps, vsImpliedPricePerShareBps),
  };

  const assetTypeBreakdown: Record<string, number> = {};
  const marketStatusBreakdown: Record<string, number> = {};
  for (const rep of representations) {
    const label = ASSET_TYPE_LABEL[rep.assetType];
    assetTypeBreakdown[label] = (assetTypeBreakdown[label] ?? 0) + 1;
    marketStatusBreakdown[rep.marketStatus] = (marketStatusBreakdown[rep.marketStatus] ?? 0) + 1;
  }

  const overlapMatrix = [...groups.values()].map((g) => ({
    underlyingTicker: g.underlyingTicker,
    platformIds: [...new Set(g.representations.map((r) => r.platformId))].sort(),
  }));

  for (const group of groups.values()) {
    for (const conflict of group.conflicts) {
      reasons.push(
        `conflicting ${conflict.field} within underlyingTicker ${group.underlyingTicker}: ${JSON.stringify(conflict.values)}`,
      );
    }
  }

  const status: TerminalStatus = reasons.length > 0 ? "INCOMPLETE" : "COMPLETE";

  const report: RwaUniverseReport = {
    probeRunId,
    gitSha: deps.gitSha,
    generatedAt: now().toISOString(),
    totalRepresentations: representations.length,
    uniqueUnderlyings: groups.size,
    multiRepresentationUnderlyings: multiRepTickers,
    platformCounts,
    reconciliation,
    assetTypeBreakdown,
    marketStatusBreakdown,
    overlapMatrix,
    ratioAnomalies,
    staleness,
    referencePriceAnalysis,
    unknownFields,
    status,
    incompleteReasons: reasons,
  };

  await deps.evidence.closeProbeRun({
    probeRunId,
    status,
    ...(reasons.length > 0 ? { incompleteReasons: reasons } : {}),
  });

  return { probeRunId, status, incompleteReasons: reasons, report };
}

function emptyReport(
  probeRunId: string,
  gitSha: string,
  generatedAt: Date,
  status: TerminalStatus,
  incompleteReasons: string[],
): RwaUniverseReport {
  return {
    probeRunId,
    gitSha,
    generatedAt: generatedAt.toISOString(),
    totalRepresentations: 0,
    uniqueUnderlyings: 0,
    multiRepresentationUnderlyings: [],
    platformCounts: {},
    reconciliation: [],
    assetTypeBreakdown: {},
    marketStatusBreakdown: {},
    overlapMatrix: [],
    ratioAnomalies: [],
    staleness: [],
    referencePriceAnalysis: {
      vsTokenPriceBps: { sampleSize: 0, min: undefined, max: undefined, medianAbs: undefined },
      vsImpliedPricePerShareBps: {
        sampleSize: 0,
        min: undefined,
        max: undefined,
        medianAbs: undefined,
      },
      verdict: "inconclusive",
    },
    unknownFields: {},
    status,
    incompleteReasons,
  };
}
