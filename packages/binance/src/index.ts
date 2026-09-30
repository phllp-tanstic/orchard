export { BinanceWeb3Client } from "./client.js";
export { buildPreHash, sign, isoMillisecondTimestamp } from "./signer.js";
export { RateLimiter, systemClock, type Clock } from "./limiter.js";
export {
  BinanceApiError,
  BinanceNonJsonResponseError,
  BinanceRateLimitError,
  DOCUMENTED_CODES,
  NO_RETRY_CODES,
  type DocumentedCode,
  type NonJsonResponseDetails,
  type ProviderEnvelope,
} from "./errors.js";
export type {
  BinanceClientOptions,
  BinanceCallResult,
  ProviderCallRecord,
  RequestSpec,
} from "./types.js";

// --- Trading API (F001-B T1) ---
export {
  TRADING_PATHS,
  assertSmallestUnitAmount,
  buildApproveTransactionRequest,
  buildQuoteRequest,
  buildSupportedChainRequest,
  buildSwapRequest,
  type ApproveTransactionRequestParams,
  type QuoteRequestParams,
  type SupportedChainRequestParams,
  type SwapRequestParams,
} from "./trading-requests.js";
export {
  DOCUMENTED_EXECUTION_MODES,
  DOCUMENTED_VENDOR_NAMES,
  SPEC_REFERENCED_RFQ_VENDORS,
  TRADING_DOCUMENTED_CODES,
  approveTransactionDataSchema,
  approveTransactionSchema,
  approveTransactionsOf,
  dexProtocolSchema,
  dexRouterEntrySchema,
  isDocumentedExecutionMode,
  isDocumentedVendorName,
  quoteDataSchema,
  quoteRouteSchema,
  routerResultSchema,
  supportedChainDataSchema,
  supportedChainSchema,
  swapDataSchema,
  swapPayloadOf,
  swapRfqSchema,
  swapTxSchema,
  tradingTokenInfoSchema,
  type ApproveTransaction,
  type QuoteRoute,
  type SupportedChain,
  type SwapData,
  type SwapRfq,
  type SwapTx,
  type TradingTokenInfo,
} from "./trading-schemas.js";

// --- Transaction API, simulate only (F001-B T2) ---
export {
  TRANSACTION_PATHS,
  buildSimulateRequest,
  type EvmTxToSimulate,
  type SimulateRequestParams,
} from "./transaction-requests.js";
export {
  DOCUMENTED_SIMULATE_STATUSES,
  allowanceChangeSchema,
  balanceChangeSchema,
  isDocumentedSimulateStatus,
  simulateDataSchema,
  type AllowanceChange,
  type BalanceChange,
  type SimulateData,
} from "./transaction-schemas.js";
