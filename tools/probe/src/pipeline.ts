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
  tryParseDecimal,
  bpsDifference,
  groupByUnderlyingTicker,
  multiRepresentationTickers,
  partitionCompleteTokens,
  toRepresentation,
  summarizeBps,
  classifyReferencePriceStability,
  ASSET_TYPE_LABEL,
  isDocumentedMarketStatus,
  PRICE_BATCH_MAX,
  type Platform,
  type BpsSample,
  type PriceQuote,
  type TokenRepresentation,
} from "@orchard/rwa";
import type {
  IncompleteTokenRecord,
  InvalidRatioEntry,
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
  /**
   * `providerCallId` is optional so BinanceWeb3Client satisfies this
   * interface unchanged. A caller that records evidence (see
   * `pnpm universe:refresh`) wraps the client to return the
   * evidence.provider_call id alongside the data, which is what lets the
   * snapshot rows below reference the exact response they came from.
   */
  request<T>(spec: RequestSpec): Promise<{ data: T; providerCallId?: string | undefined }>;
}

/**
 * Optional sink for the rwa.* snapshot tables (F003 T3). When present, the
 * pipeline hands it the ALREADY PARSED rows as it goes, so the snapshot is
 * written from the same data the probe produced rather than from a second
 * pass over the provider.
 *
 * /rwa/price results are deliberately NOT persisted: there is no price
 * snapshot table and F003 T3 permits a migration only for a read-only view or
 * index, not a new data table. Those calls still happen and are still captured
 * as evidence.provider_call rows.
 */
export interface SnapshotSink {
  platforms(args: {
    providerCallId: string;
    rows: readonly {
      platformId: string;
      platformName?: string | null | undefined;
      raw: unknown;
    }[];
  }): Promise<void>;
  tokens(args: {
    providerCallId: string;
    rows: readonly {
      platformId: string;
      tokenContractAddress: string;
      binanceChainId: string;
      underlyingTicker?: string | null | undefined;
      underlyingName?: string | null | undefined;
      assetType?: number | null | undefined;
      marketStatus?: string | null | undefined;
      tokenToShareRatio: string;
      tokenPrice?: string | null | undefined;
      referencePrice?: string | null | undefined;
      tokenPriceUpdatedAt?: Date | null | undefined;
      raw: unknown;
    }[];
  }): Promise<void>;
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

// DEC-024: PRICE_BATCH_MAX (100) is /rwa/price's documented address-count
// cap, but a 100-address batch's URL is long enough to hit the provider's
// own request-URI-length limit (HTTP 414) every time - confirmed live via a
// read-only sweep (20/40/60/80/100 addresses, chain 56): 80 succeeded, 100
// failed with 414 on every attempt (see docs/DEVEX_LOG.md for evidence
// refs). 80 is that measured safe size, not a documented value - callers
// needing a different margin can override via RunProbeDeps.priceBatchSize.
const DEFAULT_PRICE_BATCH_SIZE = 80;

export interface RunProbeDeps {
  client: RequestClient;
  evidence: EvidenceOps;
  gitSha: string;
  clientVersion: string;
  targetChainId: string;
  now?: () => Date;
  /** /rwa/price batch size (tokenContractAddresses count). Defaults to DEFAULT_PRICE_BATCH_SIZE; never exceeds PRICE_BATCH_MAX. */
  priceBatchSize?: number;
  /**
   * When set, parsed platforms and tokens are persisted to rwa.* as the
   * pipeline reads them (F003 T3). Absent for `pnpm probe:rwa`, which only
   * reports; set by `pnpm universe:refresh`, which also snapshots.
   */
  snapshot?: SnapshotSink;
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
    const response = await deps.client.request<unknown>({
      method: "GET",
      path: "/api/v1/dex/market/rwa/platforms",
    });
    const raw = response.data;
    platforms = platformsDataSchema.parse(raw);
    const extra = unknownArrayItemKeys(platformSchema.shape, raw as Record<string, unknown>[]);
    if (extra.length) unknownFields["platforms"] = extra;
    if (deps.snapshot !== undefined && response.providerCallId !== undefined) {
      await deps.snapshot.platforms({
        providerCallId: response.providerCallId,
        rows: platforms.map((platform) => ({
          platformId: platform.platformId,
          platformName: (platform as unknown as { platformName?: string }).platformName ?? null,
          raw: platform,
        })),
      });
    }
  } catch (err) {
    const reason = `failed to fetch/validate platforms: ${describeError(err)}`;
    const failedReport = emptyReport(probeRunId, deps.gitSha, now(), "FAILED", [reason]);
    await deps.evidence.closeProbeRun({
      probeRunId,
      status: "FAILED",
      incompleteReasons: [reason],
    });
    return { probeRunId, status: "FAILED", incompleteReasons: [reason], report: failedReport };
  }

  const representations: TokenRepresentation[] = [];
  const reconciliation: ReconciliationEntry[] = [];
  const platformCounts: Record<string, number> = {};
  const invalidRatios: InvalidRatioEntry[] = [];
  const incompleteTokenRecords: IncompleteTokenRecord[] = [];

  for (const platform of platforms) {
    try {
      const response = await deps.client.request<unknown>({
        method: "GET",
        path: "/api/v1/dex/market/rwa/tokens",
        query: { binanceChainId: deps.targetChainId, platformId: platform.platformId },
      });
      const raw = response.data;
      const tokens = tokensDataSchema.parse(raw);
      const extra = unknownArrayItemKeys(tokenSchema.shape, raw as Record<string, unknown>[]);
      if (extra.length) unknownFields[`tokens:${platform.platformId}`] = extra;
      if (deps.snapshot !== undefined && response.providerCallId !== undefined) {
        // EVERY token is snapshotted, including the ones partitioned out below
        // for a null assetType or underlyingName (DEC-020). The snapshot is a
        // record of what the provider returned; filtering belongs to the
        // engine, not to the stored evidence.
        await deps.snapshot.tokens({
          providerCallId: response.providerCallId,
          rows: tokens.map((token) => ({
            platformId: token.platformId,
            tokenContractAddress: token.tokenContractAddress,
            binanceChainId: token.binanceChainId,
            underlyingTicker: token.underlyingTicker,
            underlyingName: token.underlyingName,
            assetType: token.assetType,
            marketStatus: token.statusInfo.marketStatus,
            tokenToShareRatio: token.tokenToShareRatio,
            tokenPrice: token.tokenPrice,
            referencePrice: token.referencePrice,
            tokenPriceUpdatedAt: null,
            raw: token,
          })),
        });
      }

      const { complete, incomplete } = partitionCompleteTokens(tokens);
      incompleteTokenRecords.push(...incomplete);

      const reps = complete.map(toRepresentation);
      representations.push(...reps);
      // Reconciliation counts every fetched token, including ones excluded
      // from grouping below - the platform's own tokenCount doesn't know or
      // care about our data-quality filtering (DEC-020: that's an
      // observation, not a fail-closed condition).
      platformCounts[platform.platformId] = tokens.length;

      for (const rep of reps) {
        if (rep.ratioAnomalyReason === undefined) continue;
        invalidRatios.push({
          underlyingTicker: rep.underlyingTicker,
          binanceChainId: rep.binanceChainId,
          tokenContractAddress: rep.tokenContractAddress,
          tokenToShareRatio: rep.tokenToShareRatio,
          reason: rep.ratioAnomalyReason,
        });
        reasons.push(
          `invalid tokenToShareRatio for ${rep.binanceChainId}:${rep.tokenContractAddress} (${rep.underlyingTicker}): ${rep.ratioAnomalyReason}`,
        );
      }

      // DEC-023: platforms count found stable but persistently higher than
      // tokens count (458 vs 442 ondo, 80 vs 46 bstock) across multiple
      // checks; cause unresolved, not pursued further, tokens endpoint
      // treated as ground truth - reconciliation is informational only and
      // never makes the run INCOMPLETE or FAILED by itself.
      const chainEntry = platform.chainDistribution.find(
        (c) => c.binanceChainId === deps.targetChainId,
      );
      const ok = chainEntry !== undefined && chainEntry.tokenCount === tokens.length;
      reconciliation.push({
        platformId: platform.platformId,
        targetChainId: deps.targetChainId,
        reportedTokenCount: chainEntry?.tokenCount,
        actualTokenCount: tokens.length,
        ok,
      });
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

  const priceBatchSize = Math.min(deps.priceBatchSize ?? DEFAULT_PRICE_BATCH_SIZE, PRICE_BATCH_MAX);
  const priceByKey = new Map<string, PriceQuote>();
  for (const [chainId, reps] of byChain) {
    for (let i = 0; i < reps.length; i += priceBatchSize) {
      const batch = reps.slice(i, i + priceBatchSize);
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
        if (extra.length) unknownFields[`price:${chainId}:${i / priceBatchSize}`] = extra;
        for (const p of prices) priceByKey.set(`${p.binanceChainId}:${p.tokenContractAddress}`, p);
      } catch (err) {
        reasons.push(
          `failed to fetch/validate price batch for chain ${chainId}: ${describeError(err)}`,
        );
      }
    }
  }

  const staleness: StalenessEntry[] = [];
  const perShareDrift: BpsSample[] = [];
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

    // DEC-026: /rwa/tokens referencePrice (read at T1, above) and /rwa/price
    // tokenPrice (read at T2, seconds later) are the same per-underlying-share
    // quantity - see docs/DEVEX_LOG.md. Drift between them is elapsed time, so
    // this measures how far the later reading moved from the earlier baseline.
    // price.referencePrice is deliberately unused here: it sits one further
    // division by tokenToShareRatio below price.tokenPrice, an inconsistency
    // between the two endpoints that is logged and still unresolved.
    // Both are z.string() with no numeric validation, so parse defensively:
    // a non-numeric value drops this one observation instead of failing the run.
    const listReferencePrice = tryParseDecimal(rep.referencePrice);
    const refetchedPerShare = tryParseDecimal(price.tokenPrice);
    const drift =
      listReferencePrice !== undefined && refetchedPerShare !== undefined
        ? bpsDifference(refetchedPerShare, listReferencePrice)
        : undefined;
    if (drift !== undefined) {
      perShareDrift.push({
        value: drift,
        // Carried so the report can name the token behind each bps extreme.
        token: {
          tokenContractAddress: rep.tokenContractAddress,
          platformId: rep.platformId,
          underlyingTicker: rep.underlyingTicker,
        },
      });
    }
  }

  const perShareDriftBps = summarizeBps(perShareDrift);
  const referencePriceStability = {
    perShareDriftBps,
    verdict: classifyReferencePriceStability(perShareDriftBps),
  };

  const assetTypeBreakdown: Record<string, number> = {};
  const marketStatusBreakdown: Record<string, number> = {};
  // DEC-025: informational only - never pushed into `reasons`.
  const undocumentedMarketStatuses: Record<string, number> = {};
  for (const rep of representations) {
    const label = ASSET_TYPE_LABEL[rep.assetType];
    assetTypeBreakdown[label] = (assetTypeBreakdown[label] ?? 0) + 1;
    // DEC-020: marketStatus is confirmed nullable live; key it explicitly
    // rather than relying on JS's implicit null->"null" object-key coercion.
    const statusKey = rep.marketStatus ?? "null";
    marketStatusBreakdown[statusKey] = (marketStatusBreakdown[statusKey] ?? 0) + 1;
    if (rep.marketStatus !== null && !isDocumentedMarketStatus(rep.marketStatus)) {
      undocumentedMarketStatuses[rep.marketStatus] =
        (undocumentedMarketStatuses[rep.marketStatus] ?? 0) + 1;
    }
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
    undocumentedMarketStatuses,
    overlapMatrix,
    ratioAnomalies,
    invalidRatios,
    incompleteTokenRecords,
    staleness,
    referencePriceStability,
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
    undocumentedMarketStatuses: {},
    overlapMatrix: [],
    ratioAnomalies: [],
    invalidRatios: [],
    incompleteTokenRecords: [],
    staleness: [],
    referencePriceStability: {
      perShareDriftBps: {
        sampleSize: 0,
        min: undefined,
        max: undefined,
        medianAbs: undefined,
        minToken: undefined,
        maxToken: undefined,
      },
      verdict: "inconclusive",
    },
    unknownFields: {},
    status,
    incompleteReasons,
  };
}
