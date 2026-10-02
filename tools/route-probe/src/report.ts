import type { CandidateRoute, EligibilityPolicy, RouteDecision } from "@orchard/execution";

/**
 * Report shape for `pnpm route:probe` (F002 T5). The Markdown is rendered FROM
 * this JSON only - never independently computed - so a number in the document
 * always exists in the machine-readable report too.
 *
 * Nothing here is called "best execution" unless it came from a stored live
 * run: the single-ticker section reports what the engine selected and why, and
 * the batch section reports platform win counts only as observations of that
 * run.
 */

export interface TickerResult {
  underlyingTicker: string;
  /** execution.execution_request.id for this ticker, when persisted. */
  executionRequestId?: string;
  spendAmountDecimal: string;
  spendAmountSmallestUnit: string;
  candidates: CandidateRoute[];
  decision: RouteDecision;
  /** Candidate ids in ranked order, best first (mirrors decision.rankedCandidateIds). */
  rankedCandidateIds: string[];
}

export interface PlatformComparison {
  underlyingTicker: string;
  /** Platform of the winning candidate, when one was selected. */
  winnerPlatformId?: string;
  /** Eligible candidates at run time, per platform. */
  eligibleByPlatform: Record<string, number>;
  /**
   * Spread between the best eligible candidate of each platform, in bps of
   * normalized shares. Positive means the winner delivered that much more.
   * Present only when BOTH platforms had an eligible candidate.
   */
  normalizedSharesSpreadBps?: string;
  /**
   * Agreement between the two platforms' per-share benchmarks for the same
   * underlying, in bps, computed as (second - first) / first with the two
   * platform ids taken in ALPHABETICAL order, so the sign is reproducible.
   * Near zero means both platforms price the same underlying share the same
   * way, which is what makes their normalized shares comparable at all.
   *
   * Amendment A1 carries the risk that a provider "share" unit may not be the
   * same across platforms; this measures it instead of assuming it. Present
   * only when both platforms reported a benchmark.
   */
  perShareBenchmarkAgreementBps?: string;
  /** True when fewer than 2 candidates were eligible at run time. */
  fewerThanTwoEligible: boolean;
}

export interface RouteProbeReport {
  probeRunId: string;
  gitSha: string;
  generatedAt: string;
  mode: "single" | "batch";
  targetChainId: string;
  algorithmVersion: string;
  policy: EligibilityPolicy;
  /** The read-only probe address every quote was built with. Never a real wallet. */
  probeWalletAddress: string;

  results: TickerResult[];

  /** Present in batch mode only. */
  batchSummary?: {
    tickersRequested: number;
    tickersWithADecision: number;
    tickersSelected: number;
    tickersNoEligibleRoute: number;
    /** How often each platform won. An observation of this run, not a general claim. */
    winsByPlatform: Record<string, number>;
    /** Tickers where fewer than 2 candidates were eligible at run time. */
    tickersWithFewerThanTwoEligible: number;
    /** Reason codes across every rejected candidate, with counts. */
    rejectionCodeCounts: Record<string, number>;
    executionModeCounts: Record<string, number>;
    vendorCounts: Record<string, number>;
    comparisons: PlatformComparison[];
  };

  status: "COMPLETE" | "INCOMPLETE" | "FAILED";
  incompleteReasons: string[];
}

function bullets(entries: [string, number][]): string[] {
  if (entries.length === 0) return ["- none"];
  return entries
    .slice()
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, v]) => `- ${k}: ${v}`);
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

function candidateLine(c: CandidateRoute, rank: number | undefined): string {
  const head =
    rank === undefined
      ? `- [REJECTED] ${c.platformId} ${c.tokenSymbol}`
      : `- [#${rank}] ${c.platformId} ${c.tokenSymbol}`;
  const bits = [
    `\`${c.tokenContractAddress}\``,
    `assetType=${c.assetTypeLabel}`,
    `ratio=${c.tokenToShareRatio}`,
  ];
  if (c.normalizedExpectedShares !== undefined) bits.push(`shares=${c.normalizedExpectedShares}`);
  if (c.effectivePricePerShare !== undefined) bits.push(`$/share=${c.effectivePricePerShare}`);
  if (c.referencePrice !== undefined) bits.push(`benchmark=${c.referencePrice}`);
  if (c.referenceDeviationBps !== undefined) bits.push(`dev=${c.referenceDeviationBps}bps`);
  if (c.priceImpactBps !== undefined) bits.push(`impact=${c.priceImpactBps}bps`);
  if (c.tradeFee !== undefined && c.tradeFee !== null) bits.push(`tradeFee=${c.tradeFee}`);
  if (c.estimateGasFee !== undefined && c.estimateGasFee !== null) {
    bits.push(`gasFee=${c.estimateGasFee}`);
  }
  if (c.executionMode !== undefined) bits.push(`mode=${c.executionMode}`);
  if (c.vendorName !== undefined) bits.push(`vendor=${c.vendorName}`);
  if (c.quoteAgeSeconds !== undefined) bits.push(`age=${c.quoteAgeSeconds}s`);
  const reasons =
    c.rejectionReasons.length === 0
      ? ""
      : `\n    - reasons: ${c.rejectionReasons
          .map((r) => (r.providerCode === undefined ? r.code : `${r.code}(${r.providerCode})`))
          .join(", ")}`;
  return `${head} ${bits.join(" ")}${reasons}`;
}

/** Renders Markdown FROM the JSON report only. */
export function renderMarkdown(report: RouteProbeReport): string {
  const lines: string[] = [];
  lines.push("# Route Probe Report");
  lines.push("");
  lines.push(`- Probe run: \`${report.probeRunId}\``);
  lines.push(`- Status: **${report.status}**`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Git SHA: \`${report.gitSha}\``);
  lines.push(`- Chain: ${report.targetChainId}`);
  lines.push(`- Ranking algorithm: \`${report.algorithmVersion}\``);
  lines.push("");

  if (report.status !== "COMPLETE") {
    lines.push("## Incomplete reasons");
    for (const r of report.incompleteReasons) lines.push(`- ${r}`);
    lines.push("");
  }

  lines.push("## Policy in force");
  lines.push(
    `- Spend asset: ${report.policy.spendAsset.symbol} \`${report.policy.spendAsset.tokenContractAddress}\` (${report.policy.spendAsset.decimals} decimals)`,
  );
  lines.push(
    `- Allowed asset types: ${report.policy.allowedAssetTypes.join(", ")} (DEC-005: Stock and ETF)`,
  );
  lines.push(`- Max quote age: ${report.policy.maxQuoteAgeSeconds}s (DEC-036)`);
  lines.push(
    `- Max price impact: ${report.policy.maxPriceImpactBps} bps (product default, not a measured provider limit)`,
  );
  lines.push(`- Probe wallet (read-only, never signed for): \`${report.probeWalletAddress}\``);
  lines.push("");
  lines.push(
    "Normalization per F002 Amendment A1: `normalizedShares = (toTokenAmount / 10^decimals) * tokenToShareRatio`, " +
      "benchmarked against `/rwa/price` referencePrice, which is the per-share price. " +
      "`/rwa/tokens` referencePrice and tokenPrice are per-token and are NOT used here.",
  );
  lines.push("");

  if (report.batchSummary !== undefined) {
    const b = report.batchSummary;
    lines.push("## Batch summary");
    lines.push(`- Tickers requested: ${b.tickersRequested}`);
    lines.push(
      `- Selected a route: ${b.tickersSelected}/${b.tickersWithADecision} (${pct(b.tickersSelected, b.tickersWithADecision)})`,
    );
    lines.push(`- NO_ELIGIBLE_ROUTE: ${b.tickersNoEligibleRoute}`);
    lines.push(
      `- Tickers with fewer than 2 eligible candidates at run time: ${b.tickersWithFewerThanTwoEligible}`,
    );
    lines.push("");
    lines.push("### Wins by platform (this run only)");
    for (const l of bullets(Object.entries(b.winsByPlatform))) lines.push(l);
    lines.push("");
    lines.push("### executionMode seen");
    for (const l of bullets(Object.entries(b.executionModeCounts))) lines.push(l);
    lines.push("");
    lines.push("### Vendors seen");
    for (const l of bullets(Object.entries(b.vendorCounts))) lines.push(l);
    lines.push("");
    lines.push("### Rejection reasons across every rejected candidate");
    for (const l of bullets(Object.entries(b.rejectionCodeCounts))) lines.push(l);
    lines.push("");
    lines.push("### Per-ticker platform comparison");
    lines.push("");
    lines.push(
      "| Ticker | Winner | Eligible per platform | Shares spread (bps) | Per-share benchmark agreement (bps) | <2 eligible |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const c of b.comparisons) {
      const eligible = Object.entries(c.eligibleByPlatform)
        .sort(([a], [z]) => a.localeCompare(z))
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      lines.push(
        `| ${c.underlyingTicker} | ${c.winnerPlatformId ?? "none"} | ${eligible || "none"} | ` +
          `${c.normalizedSharesSpreadBps ?? "n/a"} | ${c.perShareBenchmarkAgreementBps ?? "n/a"} | ` +
          `${c.fewerThanTwoEligible ? "yes" : "no"} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Per-ticker detail");
  for (const r of report.results) {
    lines.push("");
    lines.push(
      `### ${r.underlyingTicker} - spend ${r.spendAmountDecimal} ${report.policy.spendAsset.symbol}`,
    );
    if (r.executionRequestId !== undefined) {
      lines.push(`- execution_request: \`${r.executionRequestId}\``);
    }
    lines.push(`- Outcome: **${r.decision.outcome}**`);
    lines.push(`- Reason codes: ${r.decision.reasonCodes.join(", ") || "none"}`);
    const rank = new Map(r.rankedCandidateIds.map((id, i) => [id, i + 1]));
    const winner = r.candidates.find((c) => c.id === r.decision.selectedCandidateId);
    if (winner !== undefined) {
      lines.push(
        `- Winner: ${winner.platformId} ${winner.tokenSymbol} \`${winner.tokenContractAddress}\`` +
          (winner.normalizedExpectedShares !== undefined
            ? ` with ${winner.normalizedExpectedShares} shares`
            : ""),
      );
    } else {
      lines.push(
        `- Winner: none. No eligible route; every candidate and its reasons are listed below.`,
      );
    }
    lines.push("");
    const ordered = [
      ...r.candidates
        .filter((c) => rank.has(c.id))
        .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!),
      ...r.candidates.filter((c) => !rank.has(c.id)),
    ];
    for (const c of ordered) lines.push(candidateLine(c, rank.get(c.id)));
  }
  lines.push("");

  return lines.join("\n");
}
