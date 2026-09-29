import { z } from "zod";

/**
 * zod schemas for the `data` payload of each Binance Web3 Trading API
 * endpoint used by F001-B, per
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api
 * (re-fetched 2026-09-29).
 *
 * Same discipline as F001-A's RWA schemas (packages/rwa/src/schemas.ts):
 * - every object schema is `.passthrough()`, so unknown extra fields survive
 *   parsing instead of being silently dropped. Callers surface them with
 *   `unknownObjectKeys`/`unknownArrayItemKeys` from @orchard/rwa against the
 *   `.shape` exported here.
 * - every money/price/gas field stays the provider's exact string. No floats,
 *   no coercion.
 * - `executionMode` and `vendorName` are open `z.string()`, NOT enums. The
 *   documented sets are recorded below for comparison only; F001-B section 4
 *   forbids treating any of them as fact before a live response confirms it.
 *
 * Fields the current doc page marks nullable are `.nullable()`. Fields whose
 * presence this project has not yet confirmed live are `.optional()` as well,
 * so a shape surprise on a feasibility probe is reported as an observation
 * rather than aborting a whole run over a field we were never sure about.
 */

/**
 * `executionMode` values listed on the Trading API doc page (2026-09-29):
 * SWAP (standard on-chain swap) and RFQ (signed order flow, documented for
 * equity/RWA tokens). Reference only - never a validation gate. Confirming or
 * refuting "always RFQ for tokenized stocks" against live responses is the
 * whole point of F001-B.
 */
export const DOCUMENTED_EXECUTION_MODES: readonly string[] = ["SWAP", "RFQ"];

/**
 * `vendorName` values listed on the Trading API doc page (2026-09-29):
 * LiquidMesh, Lifi, 1inch, Pancake, Jupiter.
 *
 * Note this list does NOT match the three RFQ vendor names F001B-spec.md
 * section T3 carried over from the original ingestion report (InchFusion,
 * CowSwap, PcsXRfq), which the current page does not show. Both sets are
 * recorded here as reference only; the probe reports whatever the live
 * responses actually return and flags any value in neither set.
 */
export const DOCUMENTED_VENDOR_NAMES: readonly string[] = [
  "LiquidMesh",
  "Lifi",
  "1inch",
  "Pancake",
  "Jupiter",
];

/** RFQ vendor names from F001B-spec.md T3 (original ingestion report). Unconfirmed on the current doc page. */
export const SPEC_REFERENCED_RFQ_VENDORS: readonly string[] = ["InchFusion", "CowSwap", "PcsXRfq"];

export function isDocumentedVendorName(value: string): boolean {
  return DOCUMENTED_VENDOR_NAMES.includes(value) || SPEC_REFERENCED_RFQ_VENDORS.includes(value);
}

export function isDocumentedExecutionMode(value: string): boolean {
  return DOCUMENTED_EXECUTION_MODES.includes(value);
}

/**
 * Trading-API-specific envelope codes documented on the Trading API page
 * (2026-09-29), in addition to the auth-doc codes in errors.ts. Reference
 * only: F001-B T3 step 6 exists to confirm whether an expired quoteId really
 * answers 40401 live.
 */
export const TRADING_DOCUMENTED_CODES = {
  quoteExpired: "40401",
  swapQuoteMismatch: "40462",
} as const;

// --- shared token metadata (quote fromToken/toToken, dexRouterList entries) ---

export const tradingTokenInfoSchema = z
  .object({
    tokenContractAddress: z.string(),
    tokenSymbol: z.string().optional(),
    /** USD unit price as an exact decimal string. Never parsed to a float here. */
    tokenUnitPrice: z.string().nullable().optional(),
    /** Token decimals, as a string. Needed to build smallest-unit amounts. */
    decimal: z.string().optional(),
    isHoneyPot: z.boolean().optional(),
    taxRate: z.string().nullable().optional(),
  })
  .passthrough();

export type TradingTokenInfo = z.infer<typeof tradingTokenInfoSchema>;

export const dexProtocolSchema = z
  .object({
    dexName: z.string().optional(),
    percent: z.string().optional(),
  })
  .passthrough();

export const dexRouterEntrySchema = z
  .object({
    dexProtocol: z.union([dexProtocolSchema, z.array(dexProtocolSchema)]).optional(),
    fromToken: tradingTokenInfoSchema.optional(),
    toToken: tradingTokenInfoSchema.optional(),
    fromTokenIndex: z.string().optional(),
    toTokenIndex: z.string().optional(),
  })
  .passthrough();

// --- GET /api/v1/dex/aggregator/quote ---

export const quoteRouteSchema = z
  .object({
    /** UUID without dashes per the docs; ~30s TTL. Kept verbatim. */
    quoteId: z.string(),
    vendorName: z.string(),
    binanceChainId: z.string(),
    fromTokenAmount: z.string(),
    toTokenAmount: z.string(),
    tradeFee: z.string().nullable().optional(),
    estimateGasFee: z.string().nullable().optional(),
    priceImpactPercent: z.string().nullable().optional(),
    router: z.string().nullable().optional(),
    fromToken: tradingTokenInfoSchema.optional(),
    toToken: tradingTokenInfoSchema.optional(),
    dexRouterList: z.array(dexRouterEntrySchema).nullable().optional(),
    // Open string, not an enum - see DOCUMENTED_EXECUTION_MODES.
    executionMode: z.string().optional(),
    /** Spender contract the sell token must be approved to. */
    approveTarget: z.string().nullable().optional(),
    isBest: z.boolean().optional(),
    feeAmount: z.string().nullable().optional(),
    feeToken: z.string().nullable().optional(),
    actualSwapAmount: z.string().nullable().optional(),
  })
  .passthrough();

export type QuoteRoute = z.infer<typeof quoteRouteSchema>;

/** `data` is documented as an array of routes. */
export const quoteDataSchema = z.array(quoteRouteSchema);

// --- GET /api/v1/dex/aggregator/swap ---

/**
 * A raw EVM transaction the caller would sign and broadcast. F001-B never
 * signs it; its only use here is as a candidate body for
 * POST /api/v1/dex/pre-transaction/simulate.
 */
export const swapTxSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    data: z.string(),
    value: z.string(),
    gas: z.string().nullable().optional(),
    gasPrice: z.string().nullable().optional(),
    maxPriorityFeePerGas: z.string().nullable().optional(),
    minReceiveAmount: z.string().nullable().optional(),
    slippagePercent: z.string().nullable().optional(),
    signatureData: z.array(z.string()).nullable().optional(),
    computeUnitPrice: z.string().nullable().optional(),
    computeUnitLimit: z.string().nullable().optional(),
  })
  .passthrough();

export type SwapTx = z.infer<typeof swapTxSchema>;

/**
 * Present (per the docs) only when executionMode is RFQ. `typedDataToSign` is
 * EIP-712 typed data, NOT an `evmTx` - so it is never a valid body for the
 * simulate endpoint, and F001-B T3 step 5 does not attempt to send it there.
 */
export const swapRfqSchema = z
  .object({
    vendor: z.string(),
    txType: z.string().optional(),
    typedDataToSign: z.string().optional(),
    signingScheme: z.string().nullable().optional(),
    signatureData: z.array(z.string()).nullable().optional(),
  })
  .passthrough();

export type SwapRfq = z.infer<typeof swapRfqSchema>;

export const routerResultSchema = z
  .object({
    binanceChainId: z.string().optional(),
    vendorName: z.string().optional(),
    fromTokenAmount: z.string().optional(),
    toTokenAmount: z.string().optional(),
    tradeFee: z.string().nullable().optional(),
    estimateGasFee: z.string().nullable().optional(),
    router: z.string().nullable().optional(),
    priceImpactPercent: z.string().nullable().optional(),
    dexRouterList: z.array(dexRouterEntrySchema).nullable().optional(),
    fromToken: tradingTokenInfoSchema.optional(),
    toToken: tradingTokenInfoSchema.optional(),
    feeAmount: z.string().nullable().optional(),
    feeToken: z.string().nullable().optional(),
    actualSwapAmount: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * Confirmed live 2026-09-30: /swap returns BOTH `tx` and `rfq` as keys on
 * every response, with the one that does not apply set to JSON `null` - for a
 * SWAP-mode route, `tx` is populated and `rfq` is null. The doc page describes
 * them as if only the applicable one is present, so both are nullable here.
 * Treating them as merely optional made every real payload fail to parse.
 *
 * Callers must test for null, not just for presence - `swapPayloadOf` below
 * does that, and is the only supported way to read which leg came back.
 */
export const swapDataSchema = z
  .object({
    routerResult: routerResultSchema.nullable().optional(),
    tx: swapTxSchema.nullable().optional(),
    // Open string, not an enum - see DOCUMENTED_EXECUTION_MODES.
    executionMode: z.string().optional(),
    rfq: swapRfqSchema.nullable().optional(),
  })
  .passthrough();

export type SwapData = z.infer<typeof swapDataSchema>;

/**
 * Normalizes a /swap payload to the leg that is actually present, collapsing
 * the provider's null-for-the-other-one convention. "both" and "neither" are
 * kept as distinct outcomes rather than being guessed at, so an unexpected
 * response is visible in a report instead of silently read as one leg.
 */
export function swapPayloadOf(data: SwapData): {
  kind: "tx" | "rfq" | "both" | "neither";
  tx: SwapTx | undefined;
  rfq: SwapRfq | undefined;
} {
  const tx = data.tx ?? undefined;
  const rfq = data.rfq ?? undefined;
  const kind =
    tx !== undefined && rfq !== undefined
      ? "both"
      : tx !== undefined
        ? "tx"
        : rfq !== undefined
          ? "rfq"
          : "neither";
  return { kind, tx, rfq };
}

// --- GET /api/v1/dex/aggregator/approve-transaction ---

/**
 * The inner `data` field is ABI-encoded approve() calldata - real raw
 * calldata, which is why F001-B T3 step 5 can try to simulate it.
 */
export const approveTransactionSchema = z
  .object({
    data: z.string(),
    dexContractAddress: z.string(),
    gasLimit: z.string().nullable().optional(),
    gasPrice: z.string().nullable().optional(),
  })
  .passthrough();

export type ApproveTransaction = z.infer<typeof approveTransactionSchema>;

/**
 * The doc page lists both `data[]` and the inner `data` field for this
 * endpoint, which does not settle whether the payload is one object or an
 * array of one. Accept either and let the caller record which shape arrived
 * live rather than guessing (F001-B section 4).
 */
export const approveTransactionDataSchema = z.union([
  approveTransactionSchema,
  z.array(approveTransactionSchema),
]);

/** Normalizes either accepted shape to a list, preserving order. */
export function approveTransactionsOf(
  data: z.infer<typeof approveTransactionDataSchema>,
): ApproveTransaction[] {
  return Array.isArray(data) ? data : [data];
}

// --- GET /api/v1/dex/aggregator/supported/chain ---

export const supportedChainSchema = z
  .object({
    binanceChainId: z.string(),
    name: z.string().optional(),
    shortName: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
  })
  .passthrough();

export const supportedChainDataSchema = z.array(supportedChainSchema);
export type SupportedChain = z.infer<typeof supportedChainSchema>;
