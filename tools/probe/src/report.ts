import type { BpsSummary, ReferencePriceVerdict } from "@orchard/rwa";

export interface ReconciliationEntry {
  platformId: string;
  targetChainId: string;
  reportedTokenCount: number | undefined;
  actualTokenCount: number;
  ok: boolean;
}

export interface RatioAnomaly {
  underlyingTicker: string;
  binanceChainId: string;
  tokenContractAddress: string;
  listRatio: string;
  profileRatio: string;
}

export interface StalenessEntry {
  binanceChainId: string;
  tokenContractAddress: string;
  tokenPriceUpdatedAt: string;
  ageSeconds: number;
}

export interface OverlapEntry {
  underlyingTicker: string;
  platformIds: string[];
}

export interface ReferencePriceAnalysis {
  vsTokenPriceBps: BpsSummary;
  vsImpliedPricePerShareBps: BpsSummary;
  verdict: ReferencePriceVerdict;
}

/** Blueprint M1 fields plus the reconciliation/analysis detail spec T4 requires. */
export interface RwaUniverseReport {
  probeRunId: string;
  gitSha: string;
  generatedAt: string;
  totalRepresentations: number;
  uniqueUnderlyings: number;
  multiRepresentationUnderlyings: string[];
  platformCounts: Record<string, number>;
  reconciliation: ReconciliationEntry[];
  assetTypeBreakdown: Record<string, number>;
  marketStatusBreakdown: Record<string, number>;
  overlapMatrix: OverlapEntry[];
  ratioAnomalies: RatioAnomaly[];
  staleness: StalenessEntry[];
  referencePriceAnalysis: ReferencePriceAnalysis;
  unknownFields: Record<string, string[]>;
  status: "COMPLETE" | "INCOMPLETE" | "FAILED";
  incompleteReasons: string[];
}

/** Renders the Markdown report FROM the JSON report only - never independently computed. */
export function renderMarkdown(report: RwaUniverseReport): string {
  const lines: string[] = [];
  lines.push(`# RWA Universe Probe Report`);
  lines.push("");
  lines.push(`- Probe run: \`${report.probeRunId}\``);
  lines.push(`- Status: **${report.status}**`);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Git SHA: \`${report.gitSha}\``);
  lines.push("");

  if (report.status !== "COMPLETE") {
    lines.push(`## Incomplete reasons`);
    for (const reason of report.incompleteReasons) lines.push(`- ${reason}`);
    lines.push("");
  }

  lines.push(`## Summary`);
  lines.push(`- Total representations: ${report.totalRepresentations}`);
  lines.push(`- Unique underlyings: ${report.uniqueUnderlyings}`);
  lines.push(`- Multi-representation underlyings: ${report.multiRepresentationUnderlyings.length}`);
  lines.push("");

  lines.push(`## Platform counts`);
  for (const [platformId, count] of Object.entries(report.platformCounts)) {
    lines.push(`- ${platformId}: ${count}`);
  }
  lines.push("");

  lines.push(`## Reconciliation`);
  for (const entry of report.reconciliation) {
    const mark = entry.ok ? "OK" : "MISMATCH";
    lines.push(
      `- [${mark}] ${entry.platformId} (chain ${entry.targetChainId}): reported ${entry.reportedTokenCount ?? "unknown"}, actual ${entry.actualTokenCount}`,
    );
  }
  lines.push("");

  lines.push(`## Asset type breakdown`);
  for (const [label, count] of Object.entries(report.assetTypeBreakdown)) {
    lines.push(`- ${label}: ${count}`);
  }
  lines.push("");

  lines.push(`## Market status breakdown`);
  for (const [status, count] of Object.entries(report.marketStatusBreakdown)) {
    lines.push(`- ${status}: ${count}`);
  }
  lines.push("");

  lines.push(`## Multi-representation overlap`);
  for (const entry of report.overlapMatrix.filter((e) => e.platformIds.length > 1)) {
    lines.push(`- ${entry.underlyingTicker}: ${entry.platformIds.join(", ")}`);
  }
  lines.push("");

  lines.push(`## Ratio anomalies (list tokenToShareRatio vs underlying-profile)`);
  if (report.ratioAnomalies.length === 0) {
    lines.push(`- none`);
  } else {
    for (const a of report.ratioAnomalies) {
      lines.push(
        `- ${a.underlyingTicker} ${a.binanceChainId}:${a.tokenContractAddress}: list=${a.listRatio} profile=${a.profileRatio}`,
      );
    }
  }
  lines.push("");

  lines.push(`## referencePrice analysis`);
  lines.push(`- Verdict: **${report.referencePriceAnalysis.verdict}**`);
  lines.push(
    `- vs tokenPrice (bps): n=${report.referencePriceAnalysis.vsTokenPriceBps.sampleSize}, medianAbs=${report.referencePriceAnalysis.vsTokenPriceBps.medianAbs ?? "n/a"}, range=[${report.referencePriceAnalysis.vsTokenPriceBps.min ?? "n/a"}, ${report.referencePriceAnalysis.vsTokenPriceBps.max ?? "n/a"}]`,
  );
  lines.push(
    `- vs impliedPricePerShare (bps): n=${report.referencePriceAnalysis.vsImpliedPricePerShareBps.sampleSize}, medianAbs=${report.referencePriceAnalysis.vsImpliedPricePerShareBps.medianAbs ?? "n/a"}, range=[${report.referencePriceAnalysis.vsImpliedPricePerShareBps.min ?? "n/a"}, ${report.referencePriceAnalysis.vsImpliedPricePerShareBps.max ?? "n/a"}]`,
  );
  lines.push("");

  lines.push(`## Staleness (tokenPriceUpdatedAt)`);
  const staleSorted = [...report.staleness]
    .sort((a, b) => b.ageSeconds - a.ageSeconds)
    .slice(0, 20);
  for (const s of staleSorted) {
    lines.push(
      `- ${s.binanceChainId}:${s.tokenContractAddress}: ${s.ageSeconds}s old (${s.tokenPriceUpdatedAt})`,
    );
  }
  if (report.staleness.length > staleSorted.length) {
    lines.push(`- ...and ${report.staleness.length - staleSorted.length} more`);
  }
  lines.push("");

  lines.push(`## Unknown fields observed`);
  const unknownEntries = Object.entries(report.unknownFields).filter(([, v]) => v.length > 0);
  if (unknownEntries.length === 0) {
    lines.push(`- none`);
  } else {
    for (const [endpoint, keys] of unknownEntries) {
      lines.push(`- ${endpoint}: ${keys.join(", ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
