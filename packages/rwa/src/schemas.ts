import { z } from "zod";

/**
 * zod schemas for the `data` payload of each RWA endpoint listed in
 * docs/specs/F001A-spec.md T4, per
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data
 * (fetched 2026-09-21). Every object schema uses `.passthrough()` so unknown
 * extra fields survive parsing rather than being silently dropped - see
 * `unknownObjectKeys`/`unknownArrayItemKeys` below to surface them for the
 * "unknown fields reported" requirement. Missing/mismatched required fields
 * fail visibly via zod's normal `.parse()` throw - no custom wrapper needed.
 */

export const assetTypeSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  1: "Stock",
  2: "Pre-IPO",
  3: "ETF",
};

export const marketStatusSchema = z.enum([
  "premarket",
  "regular",
  "postmarket",
  "overnight",
  "closed",
  "pause",
]);

export const statusInfoSchema = z
  .object({
    openState: z.boolean(),
    marketStatus: marketStatusSchema,
    reasonCode: z.string().nullable(),
    reasonMsg: z.string().nullable(),
    nextOpenTime: z.number().nullable(),
    nextCloseTime: z.number().nullable(),
  })
  .passthrough();

// --- GET /api/v1/dex/market/rwa/platforms ---

export const chainDistributionSchema = z
  .object({
    binanceChainId: z.string(),
    tokenCount: z.number(),
  })
  .passthrough();

export const platformSchema = z
  .object({
    platformId: z.string(),
    tickerCount: z.number(),
    chainDistribution: z.array(chainDistributionSchema),
    website: z.string().nullable(),
    logoUrl: z.string().nullable(),
  })
  .passthrough();

export const platformsDataSchema = z.array(platformSchema);
export type Platform = z.infer<typeof platformSchema>;

// --- GET /api/v1/dex/market/rwa/tokens ---

export const tokenSchema = z
  .object({
    binanceChainId: z.string(),
    tokenContractAddress: z.string(),
    platformId: z.string(),
    assetType: assetTypeSchema,
    tokenName: z.string(),
    tokenSymbol: z.string(),
    tokenLogoUrl: z.string(),
    decimals: z.string(),
    underlyingTicker: z.string(),
    underlyingName: z.string(),
    underlyingNameZh: z.string().nullable().optional(),
    tokenToShareRatio: z.string(),
    tags: z.array(z.string()).nullable().optional(),
    statusInfo: statusInfoSchema,
    tokenPrice: z.string(),
    referencePrice: z.string(),
    volume24H: z.string(),
    marketCap: z.string(),
    peRatioTTM: z.string().nullable().optional(),
  })
  .passthrough();

export const tokensDataSchema = z.array(tokenSchema);
export type Token = z.infer<typeof tokenSchema>;

// --- GET /api/v1/dex/market/rwa/price ---

export const priceSchema = z
  .object({
    binanceChainId: z.string(),
    tokenContractAddress: z.string(),
    platformId: z.string(),
    tokenPrice: z.string(),
    referencePrice: z.string(),
    tokenPriceUpdatedAt: z.number(),
  })
  .passthrough();

export const pricesDataSchema = z.array(priceSchema);
export type PriceQuote = z.infer<typeof priceSchema>;

/** Binance's documented cap for /rwa/price's tokenContractAddresses batch. */
export const PRICE_BATCH_MAX = 100;

// --- GET /api/v1/dex/market/rwa/search ---

export const searchAssetSchema = z
  .object({
    platformId: z.string(),
    binanceChainId: z.string(),
    tokenContractAddress: z.string(),
    tokenSymbol: z.string(),
    assetType: assetTypeSchema,
  })
  .passthrough();

export const searchResultSchema = z
  .object({
    ticker: z.string(),
    companyName: z.string(),
    assets: z.array(searchAssetSchema),
  })
  .passthrough();

export const searchDataSchema = z.array(searchResultSchema);
export type SearchResult = z.infer<typeof searchResultSchema>;

// --- GET /api/v1/dex/market/rwa/underlying-profile ---

export const protectionEntrySchema = z
  .object({
    supported: z.boolean(),
    url: z.string().nullable(),
  })
  .passthrough();

export const underlyingProfileDataSchema = z
  .object({
    binanceChainId: z.string(),
    tokenContractAddress: z.string(),
    platformId: z.string(),
    underlyingTicker: z.string(),
    underlyingFullName: z.string(),
    assetType: assetTypeSchema,
    tokenToShareRatio: z.string(),
    protections: z.record(z.string(), protectionEntrySchema),
    companyInfo: z.unknown().nullable(),
  })
  .passthrough();

export type UnderlyingProfile = z.infer<typeof underlyingProfileDataSchema>;

// --- Unknown-field reporting (kept via passthrough, surfaced here) ---

/** Names of top-level keys present in `raw` but not declared on `shape`. */
export function unknownObjectKeys(
  shape: Record<string, unknown>,
  raw: Record<string, unknown>,
): string[] {
  const known = new Set(Object.keys(shape));
  return Object.keys(raw).filter((key) => !known.has(key));
}

/** Union of unknown top-level keys across every item of a raw array, deduped. */
export function unknownArrayItemKeys(
  shape: Record<string, unknown>,
  raw: readonly Record<string, unknown>[],
): string[] {
  const found = new Set<string>();
  for (const item of raw) {
    for (const key of unknownObjectKeys(shape, item)) found.add(key);
  }
  return [...found].sort();
}
