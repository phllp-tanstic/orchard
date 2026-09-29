import type { RequestSpec } from "./types.js";

/**
 * Request builder for the Binance Web3 Transaction API `Simulate Transactions`
 * endpoint, per
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api
 * (re-fetched 2026-09-29, as F001B-spec.md T2 requires).
 *
 * DEVIATION from F001B-spec.md T2, which named the path `POST
 * /transaction/simulate`: the current doc page groups this endpoint under
 * `pre-transaction`, so the real path is
 * `POST /api/v1/dex/pre-transaction/simulate`. The spec flagged its own path
 * as a placeholder to re-verify; this is that verification, recorded here so
 * the difference is visible in code, not just in a report.
 *
 * Simulate only. F001-B builds no broadcast client - the doc page's
 * `POST /api/v1/dex/pre-transaction/broadcast-transaction` is deliberately
 * not wrapped here (out of scope until M5).
 */

export const TRANSACTION_PATHS = {
  simulate: "/api/v1/dex/pre-transaction/simulate",
} as const;

/**
 * An EVM transaction to dry-run. Exactly the four documented `evmTx` fields.
 * `value` is wei as a string; `data` is ABI-encoded calldata. Nothing here is
 * ever signed or broadcast.
 */
export interface EvmTxToSimulate {
  from: string;
  to: string;
  /** Native-token amount in wei, as an exact string. "0" for a pure token call. */
  value: string;
  data: string;
}

export interface SimulateRequestParams {
  binanceChainId: string;
  evmTx: EvmTxToSimulate;
}

function assertNonEmpty(field: string, value: string): void {
  if (value.trim() === "") throw new Error(`${field} must not be empty`);
}

/**
 * Wei as an unsigned base-10 integer string. Rejects the float/exponent forms
 * a provider could mis-scale, same rule as the Trading API amount fields.
 */
const WEI_PATTERN = /^(0|[1-9]\d*)$/;

export function buildSimulateRequest(params: SimulateRequestParams): RequestSpec {
  assertNonEmpty("binanceChainId", params.binanceChainId);
  assertNonEmpty("evmTx.from", params.evmTx.from);
  assertNonEmpty("evmTx.to", params.evmTx.to);
  assertNonEmpty("evmTx.data", params.evmTx.data);
  if (!WEI_PATTERN.test(params.evmTx.value)) {
    throw new Error(
      `evmTx.value must be a wei integer string (no sign, decimal point, exponent, or leading zeros), got "${params.evmTx.value}"`,
    );
  }
  return {
    method: "POST",
    path: TRANSACTION_PATHS.simulate,
    body: {
      binanceChainId: params.binanceChainId,
      evmTx: {
        from: params.evmTx.from,
        to: params.evmTx.to,
        value: params.evmTx.value,
        data: params.evmTx.data,
      },
    },
  };
}
