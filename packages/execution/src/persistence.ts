import type { Pool } from "pg";
import type { CandidateRoute, EligibilityPolicy, RouteDecision } from "./types.js";
import type { RunResult } from "./orchestrator.js";

/**
 * Persistence for execution.* (F002 T4). Append-only by construction: this
 * module only ever INSERTs, and the database enforces the rest (no UPDATE, no
 * DELETE, no TRUNCATE, RLS on, orchard_app granted SELECT/INSERT only -
 * migration 008).
 *
 * The three inserts for one run go in ONE transaction, so a decision can never
 * be stored without the candidates that justify it.
 */

export interface PersistRunArgs {
  probeRunId: string;
  result: RunResult;
}

export interface PersistedRun {
  executionRequestId: string;
  /** Engine candidate id -> database row id. */
  candidateRowIds: Map<string, string>;
  routeDecisionId: string;
}

function policyJson(policy: EligibilityPolicy): string {
  return JSON.stringify({
    maxPriceImpactBps: policy.maxPriceImpactBps,
    maxQuoteAgeSeconds: policy.maxQuoteAgeSeconds,
    allowedAssetTypes: [...policy.allowedAssetTypes],
    spendAsset: policy.spendAsset,
  });
}

/** Numeric columns take null rather than a fabricated zero when unknown. */
function numOrNull(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

export async function persistRun(pool: Pool, args: PersistRunArgs): Promise<PersistedRun> {
  const { probeRunId, result } = args;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const req = await client.query<{ id: string }>(
      `INSERT INTO execution.execution_request
         (probe_run_id, underlying_ticker, spend_asset_symbol, spend_asset_address,
          spend_amount_decimal, spend_amount_smallest_unit, target_chain_id, policy,
          algorithm_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        probeRunId,
        result.request.underlyingTicker,
        result.request.policy.spendAsset.symbol,
        result.request.policy.spendAsset.tokenContractAddress,
        result.request.spendAmountDecimal,
        result.spendAmountSmallestUnit,
        result.request.targetChainId,
        policyJson(result.request.policy),
        result.decision.algorithmVersion,
      ],
    );
    const executionRequestId = req.rows[0]!.id;

    const candidateRowIds = new Map<string, string>();
    for (const c of result.candidates) {
      const row = await client.query<{ id: string }>(
        `INSERT INTO execution.candidate_route
           (execution_request_id, provider_call_id, representation_id, platform_id,
            token_contract_address, binance_chain_id, token_symbol, asset_type,
            asset_type_label, token_to_share_ratio, quote_provider, quote_id,
            input_amount_smallest_unit, expected_output_token_amount, to_token_decimals,
            normalized_expected_shares, effective_price_per_share, reference_price,
            reference_deviation_bps, price_impact_bps, trade_fee, estimate_gas_fee,
            execution_mode, vendor_name, quote_timestamp, quote_age_seconds,
            eligibility, rejection_reasons)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 $21,$22,$23,$24,$25,$26,$27,$28)
         RETURNING id`,
        [
          executionRequestId,
          c.providerCallId ?? null,
          c.representationId,
          c.platformId,
          c.tokenContractAddress,
          c.binanceChainId,
          c.tokenSymbol,
          c.assetType,
          c.assetTypeLabel,
          c.tokenToShareRatio,
          c.quoteProvider,
          c.quoteId ?? null,
          c.inputAmount,
          c.expectedOutputTokenAmount ?? null,
          c.toTokenDecimals ?? null,
          numOrNull(c.normalizedExpectedShares),
          numOrNull(c.effectivePricePerShare),
          numOrNull(c.referencePrice),
          numOrNull(c.referenceDeviationBps),
          numOrNull(c.priceImpactBps),
          c.tradeFee ?? null,
          c.estimateGasFee ?? null,
          c.executionMode ?? null,
          c.vendorName ?? null,
          c.quoteTimestamp ?? null,
          c.quoteAgeSeconds ?? null,
          c.eligibility,
          JSON.stringify(c.rejectionReasons),
        ],
      );
      candidateRowIds.set(c.id, row.rows[0]!.id);
    }

    const selectedRowId =
      result.decision.selectedCandidateId === null
        ? null
        : (candidateRowIds.get(result.decision.selectedCandidateId) ?? null);
    if (result.decision.outcome === "SELECTED" && selectedRowId === null) {
      throw new Error(
        `decision selected candidate ${result.decision.selectedCandidateId} but no row was inserted for it`,
      );
    }

    const dec = await client.query<{ id: string }>(
      `INSERT INTO execution.route_decision
         (execution_request_id, selected_candidate_id, algorithm_version,
          ranked_candidate_ids, reason_codes, outcome, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        executionRequestId,
        selectedRowId,
        result.decision.algorithmVersion,
        JSON.stringify(
          result.decision.rankedCandidateIds.map((id) => candidateRowIds.get(id) ?? id),
        ),
        JSON.stringify(result.decision.reasonCodes),
        result.decision.outcome,
        result.decision.decidedAt,
      ],
    );

    await client.query("COMMIT");
    return { executionRequestId, candidateRowIds, routeDecisionId: dec.rows[0]!.id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface StoredDecision {
  executionRequestId: string;
  outcome: RouteDecision["outcome"];
  selectedCandidateId: string | null;
  algorithmVersion: string;
  reasonCodes: string[];
  candidateCount: number;
  eligibleCount: number;
}

/** Reads one stored run back, for reconciling a report against the database. */
export async function readStoredDecision(
  pool: Pool,
  executionRequestId: string,
): Promise<StoredDecision | undefined> {
  const res = await pool.query(
    `SELECT d.execution_request_id, d.outcome, d.selected_candidate_id, d.algorithm_version,
            d.reason_codes,
            (SELECT count(*) FROM execution.candidate_route c
              WHERE c.execution_request_id = d.execution_request_id) AS candidate_count,
            (SELECT count(*) FROM execution.candidate_route c
              WHERE c.execution_request_id = d.execution_request_id
                AND c.eligibility = 'ELIGIBLE') AS eligible_count
       FROM execution.route_decision d
      WHERE d.execution_request_id = $1`,
    [executionRequestId],
  );
  const row = res.rows[0] as
    | {
        execution_request_id: string;
        outcome: RouteDecision["outcome"];
        selected_candidate_id: string | null;
        algorithm_version: string;
        reason_codes: string[];
        candidate_count: string;
        eligible_count: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    executionRequestId: row.execution_request_id,
    outcome: row.outcome,
    selectedCandidateId: row.selected_candidate_id,
    algorithmVersion: row.algorithm_version,
    reasonCodes: row.reason_codes,
    candidateCount: Number(row.candidate_count),
    eligibleCount: Number(row.eligible_count),
  };
}

export type { CandidateRoute };
