import { Decimal } from "decimal.js";
import type { CandidateRoute } from "./types.js";

/**
 * Deterministic ranking (F002 T3), blueprint Stage B step 8.
 *
 * No weighted score. No LLM. No randomness. No clock. The comparison is a
 * fixed lexicographic cascade, and the final tie-break is total, so the
 * ordering is a strict total order on any input set: ranking the same
 * candidates in any input order yields the identical output.
 *
 * Bump ALGORITHM_VERSION whenever the comparison changes, including a
 * tie-break. Every RouteDecision records it, so a stored decision can always
 * be explained by the rules that produced it.
 */
export const ALGORITHM_VERSION = "f002-rank-1.0.0";

/** The cascade, in order. Recorded on a decision as the step that settled it. */
export const RANKING_STEPS = [
  "NORMALIZED_SHARES_DESC",
  "EXPLICIT_FEES_ASC",
  "QUOTE_FRESHNESS_ASC",
  "PRICE_IMPACT_ASC",
  "TOKEN_ADDRESS_LEXICOGRAPHIC",
] as const;

export type RankingStep = (typeof RANKING_STEPS)[number];

/**
 * Explicit fees, summed, only when BOTH candidates report them in the same
 * unit (F002 T3 step 2). tradeFee is documented in USD and estimateGasFee in
 * the chain's smallest native unit, so they are NOT added together across
 * units: each is compared on its own, tradeFee first. undefined means "this
 * candidate did not report it", which makes the step inapplicable rather than
 * zero - treating a missing fee as zero would silently favour the candidate
 * that disclosed less.
 */
function feeOf(
  candidate: CandidateRoute,
  field: "tradeFee" | "estimateGasFee",
): Decimal | undefined {
  const raw = candidate[field];
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(raw)) return undefined;
  return new Decimal(raw);
}

function compareOptionalDecimalAsc(
  a: Decimal | undefined,
  b: Decimal | undefined,
): number | undefined {
  // Only comparable when both are present: otherwise the step does not apply.
  if (a === undefined || b === undefined) return undefined;
  const c = a.comparedTo(b);
  return c === 0 ? undefined : c;
}

export interface RankingComparison {
  /** -1 when a ranks ahead of b, 1 when b ranks ahead of a. Never 0. */
  order: number;
  /** The first step that distinguished them. */
  step: RankingStep;
}

/**
 * Compares two candidates by the cascade. Returns which step settled it, so a
 * decision can record the reason rather than only the result.
 *
 * Candidates without normalizedExpectedShares must never reach here: they are
 * REJECTED by eligibility, and ranking only ever sees ELIGIBLE candidates.
 */
export function compareCandidates(a: CandidateRoute, b: CandidateRoute): RankingComparison {
  // 1. Highest normalized shares for the fixed spend.
  const sharesA = new Decimal(a.normalizedExpectedShares ?? "0");
  const sharesB = new Decimal(b.normalizedExpectedShares ?? "0");
  const byShares = sharesB.comparedTo(sharesA); // descending
  if (byShares !== 0) return { order: byShares, step: "NORMALIZED_SHARES_DESC" };

  // 2. Lower explicit fees, where both report the same field.
  const byTradeFee = compareOptionalDecimalAsc(feeOf(a, "tradeFee"), feeOf(b, "tradeFee"));
  if (byTradeFee !== undefined) return { order: byTradeFee, step: "EXPLICIT_FEES_ASC" };
  const byGasFee = compareOptionalDecimalAsc(
    feeOf(a, "estimateGasFee"),
    feeOf(b, "estimateGasFee"),
  );
  if (byGasFee !== undefined) return { order: byGasFee, step: "EXPLICIT_FEES_ASC" };

  // 3. Fresher quote: smaller age wins.
  if (a.quoteAgeSeconds !== undefined && b.quoteAgeSeconds !== undefined) {
    if (a.quoteAgeSeconds !== b.quoteAgeSeconds) {
      return {
        order: a.quoteAgeSeconds < b.quoteAgeSeconds ? -1 : 1,
        step: "QUOTE_FRESHNESS_ASC",
      };
    }
  }

  // 4. Lower price impact.
  const byImpact = compareOptionalDecimalAsc(
    a.priceImpactBps === undefined ? undefined : new Decimal(a.priceImpactBps),
    b.priceImpactBps === undefined ? undefined : new Decimal(b.priceImpactBps),
  );
  if (byImpact !== undefined) return { order: byImpact, step: "PRICE_IMPACT_ASC" };

  // 5. Total tie-break: lexicographic token contract address, lower-cased so
  // checksum casing cannot change an ordering. Addresses are unique per
  // representation, so this always settles it.
  const addrA = a.tokenContractAddress.toLowerCase();
  const addrB = b.tokenContractAddress.toLowerCase();
  if (addrA !== addrB) {
    return { order: addrA < addrB ? -1 : 1, step: "TOKEN_ADDRESS_LEXICOGRAPHIC" };
  }
  // Same address twice in one request is a caller error, but the order must
  // still be total and stable, so fall back to the candidate id.
  return { order: a.id < b.id ? -1 : a.id > b.id ? 1 : 0, step: "TOKEN_ADDRESS_LEXICOGRAPHIC" };
}

/**
 * Ranks ELIGIBLE candidates best-first. Input is never mutated. Rejected
 * candidates are dropped rather than ranked last, because a rejected route is
 * not a worse choice - it is not a choice.
 */
export function rankCandidates(candidates: readonly CandidateRoute[]): CandidateRoute[] {
  return candidates
    .filter((c) => c.eligibility === "ELIGIBLE")
    .slice()
    .sort((a, b) => compareCandidates(a, b).order);
}

/** The step that settled the winner against the runner-up, when there is one. */
export function decidingStep(ranked: readonly CandidateRoute[]): RankingStep | undefined {
  if (ranked.length < 2) return undefined;
  return compareCandidates(ranked[0]!, ranked[1]!).step;
}
