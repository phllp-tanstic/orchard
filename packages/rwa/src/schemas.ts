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

/**
 * DEC-025: marketStatus values confirmed so far. Reference only - NOT a
 * validation gate. The provider has returned values outside the documented
 * set more than once (DEC-019 "offhours", DEC-021 "paused"), so the schema
 * accepts any string and the probe reports values outside this list rather
 * than failing the run.
 *
 * "paused": confirmed live (ondo, chain 56, probe_run
 * 3ffea1da-004d-4a2d-b0ec-1639aceee3f5) - see docs/DEVEX_LOG.md. "pause" is
 * documented but has never been observed live (976 tokens audited under
 * DEC-021); kept for reference.
 */
export const DOCUMENTED_MARKET_STATUSES: readonly string[] = [
  "premarket",
  "regular",
  "postmarket",
  "overnight",
  "offhours",
  "closed",
  "pause",
  "paused",
];

export function isDocumentedMarketStatus(value: string): boolean {
  return DOCUMENTED_MARKET_STATUSES.includes(value);
}

// DEC-025: open string, not an enum - see DOCUMENTED_MARKET_STATUSES.
export const marketStatusSchema = z.string();

export const statusInfoSchema = z
  .object({
    openState: z.boolean(),
    // DEC-020: confirmed live null on the tokens endpoint (bstock, chain 56,
    // probe_run e2e78fa9-6ff2-4daa-877b-592439128c5e) - see docs/DEVEX_LOG.md.
    marketStatus: marketStatusSchema.nullable(),
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
    // DEC-020: confirmed live null on the tokens endpoint (ondo, chain 56,
    // probe_run e2e78fa9-6ff2-4daa-877b-592439128c5e) - see docs/DEVEX_LOG.md.
    // A null assetType or underlyingName can't be meaningfully grouped or
    // typed; tools/probe's pipeline excludes such tokens from
    // grouping/normalization rather than passing them through as valid data.
    assetType: assetTypeSchema.nullable(),
    tokenName: z.string(),
    tokenSymbol: z.string(),
    tokenLogoUrl: z.string(),
    decimals: z.string(),
    underlyingTicker: z.string(),
    underlyingName: z.string().nullable(),
    underlyingNameZh: z.string().nullable().optional(),
    tokenToShareRatio: z.string(),
    tags: z.array(z.string()).nullable().optional(),
    statusInfo: statusInfoSchema,
    tokenPrice: z.string(),
    referencePrice: z.string(),
    volume24H: z.string(),
    // DEC-021: confirmed live null on the tokens endpoint (bstock, chain 56,
    // probe_run cbf81217-d651-4e5f-83c2-14b88c472b7f) - see docs/DEVEX_LOG.md.
    // Not a grouping/typing key (unlike assetType/underlyingName), so no
    // exclusion needed - passed through as-is.
    marketCap: z.string().nullable(),
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
