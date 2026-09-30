import { z } from "zod";

/**
 * zod schemas for the `data` payload of the Binance Web3 Transaction API
 * `Simulate Transactions` endpoint, per
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api
 * (re-fetched 2026-09-29).
 *
 * Same discipline as the Trading API schemas: `.passthrough()` everywhere,
 * every amount an exact provider string, and `status` an open `z.string()`
 * rather than an enum - the doc page gives SUCCESS only as an example ("e.g.
 * SUCCESS"), which is not an enumeration, so the probe reports whatever value
 * arrives instead of failing on an undocumented one.
 */

/** `status` values seen on the doc page. Reference only - never a validation gate. */
export const DOCUMENTED_SIMULATE_STATUSES: readonly string[] = ["SUCCESS"];

export function isDocumentedSimulateStatus(value: string): boolean {
  return DOCUMENTED_SIMULATE_STATUSES.includes(value);
}

export const balanceChangeSchema = z
  .object({
    contractAddress: z.string().nullable().optional(),
    tokenType: z.string().nullable().optional(),
    /** Signed smallest-unit delta, exact provider string. */
    change: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
  })
  .passthrough();

export const allowanceChangeSchema = z
  .object({
    tokenAddress: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
    spender: z.string().nullable().optional(),
    preAmount: z.string().nullable().optional(),
    postAmount: z.string().nullable().optional(),
  })
  .passthrough();

export const simulateDataSchema = z
  .object({
    // Open string, not an enum - see DOCUMENTED_SIMULATE_STATUSES.
    status: z.string(),
    failReason: z.string().nullable().optional(),
    balanceChanges: z.array(balanceChangeSchema).nullable().optional(),
    allowanceChanges: z.array(allowanceChangeSchema).nullable().optional(),
  })
  .passthrough();

export type SimulateData = z.infer<typeof simulateDataSchema>;
export type BalanceChange = z.infer<typeof balanceChangeSchema>;
export type AllowanceChange = z.infer<typeof allowanceChangeSchema>;
