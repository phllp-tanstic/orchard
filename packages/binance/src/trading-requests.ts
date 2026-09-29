import type { RequestSpec } from "./types.js";

/**
 * Request builders for the Binance Web3 Trading API, per
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api
 * (re-fetched 2026-09-29 for F001-B T1, not taken from memory or an earlier
 * ingestion report). Paths are relative to the API root without the `/build`
 * prefix - BinanceWeb3Client owns that prefix and the signing.
 *
 * These builders only shape and validate a request. They never sign a
 * transaction, submit an order, or broadcast anything (F001-B section 4).
 */

export const TRADING_PATHS = {
  supportedChain: "/api/v1/dex/aggregator/supported/chain",
  approveTransaction: "/api/v1/dex/aggregator/approve-transaction",
  quote: "/api/v1/dex/aggregator/quote",
  swap: "/api/v1/dex/aggregator/swap",
} as const;

/**
 * An unsigned integer in base-10 with no leading zeros (except "0" itself).
 * Token amounts on this API are smallest-unit integer strings; a float, an
 * exponent, or a decimal point would be silently mis-scaled by the provider,
 * so those are rejected here rather than sent (AGENTS.md: no floats in money
 * math).
 */
const SMALLEST_UNIT_PATTERN = /^(0|[1-9]\d*)$/;

export function assertSmallestUnitAmount(field: string, value: string): void {
  if (!SMALLEST_UNIT_PATTERN.test(value)) {
    throw new Error(
      `${field} must be a smallest-unit integer string (no sign, decimal point, exponent, or leading zeros), got "${value}"`,
    );
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (value.trim() === "") throw new Error(`${field} must not be empty`);
}

export interface QuoteRequestParams {
  binanceChainId: string;
  /** Sell amount, smallest-unit integer string of fromToken's `decimal`. */
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  /**
   * Documented as required when quoting RFQ routes (equity/RWA tokens) and
   * used as the receiver of the RFQ order. Nothing here signs on its behalf,
   * so no matching private key is needed for a quote (F001-B section 4).
   */
  userWalletAddress?: string;
  vendor?: string;
  feePercent?: string;
  feeSource?: string;
}

export function buildQuoteRequest(params: QuoteRequestParams): RequestSpec {
  assertNonEmpty("binanceChainId", params.binanceChainId);
  assertNonEmpty("fromTokenAddress", params.fromTokenAddress);
  assertNonEmpty("toTokenAddress", params.toTokenAddress);
  assertSmallestUnitAmount("amount", params.amount);
  return {
    method: "GET",
    path: TRADING_PATHS.quote,
    query: {
      binanceChainId: params.binanceChainId,
      amount: params.amount,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      userWalletAddress: params.userWalletAddress,
      vendor: params.vendor,
      feePercent: params.feePercent,
      feeSource: params.feeSource,
    },
  };
}

export interface SwapRequestParams {
  binanceChainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  /** Documented as required for /swap. */
  userWalletAddress: string;
  /** The `quoteId` of the exact route being built. ~30s TTL per the docs. */
  quoteId: string;
  slippagePercent?: string;
  approveTransaction?: string;
  approveAmount?: string;
  gasLimit?: string;
  gasLevel?: string;
  priceImpactProtectionPercent?: string;
  autoSlippage?: string;
  maxAutoSlippagePercent?: string;
  feePercent?: string;
}

export function buildSwapRequest(params: SwapRequestParams): RequestSpec {
  assertNonEmpty("binanceChainId", params.binanceChainId);
  assertNonEmpty("fromTokenAddress", params.fromTokenAddress);
  assertNonEmpty("toTokenAddress", params.toTokenAddress);
  assertNonEmpty("userWalletAddress", params.userWalletAddress);
  assertNonEmpty("quoteId", params.quoteId);
  assertSmallestUnitAmount("amount", params.amount);
  if (params.approveAmount !== undefined) {
    assertSmallestUnitAmount("approveAmount", params.approveAmount);
  }
  return {
    method: "GET",
    path: TRADING_PATHS.swap,
    query: {
      binanceChainId: params.binanceChainId,
      amount: params.amount,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      userWalletAddress: params.userWalletAddress,
      quoteId: params.quoteId,
      slippagePercent: params.slippagePercent,
      approveTransaction: params.approveTransaction,
      approveAmount: params.approveAmount,
      gasLimit: params.gasLimit,
      gasLevel: params.gasLevel,
      priceImpactProtectionPercent: params.priceImpactProtectionPercent,
      autoSlippage: params.autoSlippage,
      maxAutoSlippagePercent: params.maxAutoSlippagePercent,
      feePercent: params.feePercent,
    },
  };
}

export interface ApproveTransactionRequestParams {
  binanceChainId: string;
  tokenContractAddress: string;
  /** Allowance to approve, smallest-unit integer string. */
  approveAmount: string;
  /**
   * Documented optional. Passed as the RFQ vendor name to get that vendor's
   * spender contract instead of the standard DEX router's - F001-B T3 step 5
   * exists to find out empirically whether that calldata is simulatable.
   */
  vendor?: string;
}

export function buildApproveTransactionRequest(
  params: ApproveTransactionRequestParams,
): RequestSpec {
  assertNonEmpty("binanceChainId", params.binanceChainId);
  assertNonEmpty("tokenContractAddress", params.tokenContractAddress);
  assertSmallestUnitAmount("approveAmount", params.approveAmount);
  return {
    method: "GET",
    path: TRADING_PATHS.approveTransaction,
    query: {
      binanceChainId: params.binanceChainId,
      tokenContractAddress: params.tokenContractAddress,
      approveAmount: params.approveAmount,
      vendor: params.vendor,
    },
  };
}

export interface SupportedChainRequestParams {
  binanceChainId?: string;
}

export function buildSupportedChainRequest(params: SupportedChainRequestParams = {}): RequestSpec {
  return {
    method: "GET",
    path: TRADING_PATHS.supportedChain,
    query: { binanceChainId: params.binanceChainId },
  };
}
