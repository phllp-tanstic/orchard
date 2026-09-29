/**
 * Report shape for `pnpm probe:quote` (F001B-spec.md T3). Every field records
 * what a live response actually contained. Nothing here is computed from
 * documentation, and no field asserts that something "works" - a simulation
 * outcome is the provider's own status string plus its raw failure reason.
 */

export type TerminalStatus = "COMPLETE" | "INCOMPLETE" | "FAILED";

/** Which leg of a route a simulate attempt was made against, if any. */
export type SimulatedLeg = "swapTx" | "approveCalldata";

export interface SimulateAttempt {
  leg: SimulatedLeg;
  /** The exact `to` the simulated calldata targeted (token contract or router). */
  to: string;
  /** Provider `data.status` verbatim when the call returned; undefined when it errored out. */
  status?: string;
  /** Provider `data.failReason` verbatim. */
  failReason?: string | null;
  /** True only when the envelope came back code 0 AND a status was present. */
  returned: boolean;
  /** Error text when the call itself failed (envelope code, HTTP, or schema). */
  error?: string;
  /** Envelope code when the provider rejected the call. */
  providerCode?: string;
  balanceChangeCount?: number;
  allowanceChangeCount?: number;
}

/** One quote attempt for one representation at one spend size. */
export interface QuoteAttempt {
  spendUsd: string;
  /** Spend amount actually sent, in the spend token's smallest units. */
  amount: string;
  /** True when /quote returned at least one route. */
  quoted: boolean;
  /** Error text when /quote itself failed or returned nothing usable. */
  quoteError?: string;
  providerCode?: string;
  routeCount?: number;
  /** Every executionMode seen across the returned routes. */
  executionModes?: string[];
  /** Every vendorName seen across the returned routes. */
  vendorNames?: string[];
  /** The isBest route's figures, exact provider strings. */
  best?: {
    quoteId: string;
    vendorName: string;
    executionMode?: string;
    toTokenAmount: string;
    priceImpactPercent?: string | null;
    tradeFee?: string | null;
    estimateGasFee?: string | null;
    approveTarget?: string | null;
    /** True when the provider flagged isBest; false when no route did and the first was used. */
    isBestFlagged: boolean;
  };
  /** Whether /swap was attempted for the best route, and what shape came back. */
  swap?: {
    attempted: true;
    succeeded: boolean;
    error?: string;
    providerCode?: string;
    executionMode?: string;
    /** Which of the two mutually exclusive payloads was present. */
    payload?: "tx" | "rfq" | "both" | "neither";
    /** Field names present on data.tx, so the exact shape is on record. */
    txFields?: string[];
    /** Field names present on data.rfq. */
    rfqFields?: string[];
    rfqVendor?: string;
  };
  /** The approve-transaction call made only on the RFQ path (spec T3 step 5). */
  approve?: {
    attempted: true;
    /** The rfq.vendor passed as `vendor`, when there was one. */
    vendor?: string;
    succeeded: boolean;
    error?: string;
    providerCode?: string;
    /** Which shape the payload arrived in - the doc page does not settle this. */
    payloadShape?: "object" | "array";
    spenderAddress?: string;
  };
  simulate?: SimulateAttempt;
}

export interface RepresentationResult {
  platformId: string;
  underlyingTicker: string;
  binanceChainId: string;
  tokenContractAddress: string;
  tokenSymbol: string;
  /** "multi" when the ticker has more than one representation, else "single". */
  sampleGroup: "multi" | "single";
  attempts: QuoteAttempt[];
}

/**
 * The quoteId-reuse check (spec T3 step 6). Deliberately run a bounded number
 * of times per run rather than per representation: each one costs a >30s wait,
 * and TTL behavior is a property of the endpoint, not of a token.
 */
export interface TtlObservation {
  platformId: string;
  underlyingTicker: string;
  tokenContractAddress: string;
  spendUsd: string;
  waitSeconds: number;
  /** Outcome of reusing the FIRST quoteId in /swap after the wait. */
  expiredQuoteRejected: boolean;
  /** Provider envelope code for that reuse attempt, verbatim. */
  reuseProviderCode?: string;
  reuseErrorMessage?: string;
  /** True when reuseProviderCode equals the documented 40401 QUOTE_EXPIRED. */
  matchedDocumentedExpiryCode: boolean;
  /** Fresh re-quote after the wait: did it quote, and how far did the price move. */
  requoted: boolean;
  firstToTokenAmount?: string;
  requotedToTokenAmount?: string;
  /** Drift of the re-quote from the first quote, in basis points. Exact decimal string. */
  driftBps?: string;
  error?: string;
}

export interface QuoteFeasibilityReport {
  probeRunId: string;
  gitSha: string;
  generatedAt: string;

  /** Exactly what was sampled and how, so the run is reproducible. */
  sampling: {
    seed: string;
    singleRepPerPlatform: number;
    multiRepresentationTickerCount: number;
    multiRepresentationTickers: string[];
    multiRepresentationCount: number;
    singleRepresentationCount: number;
    totalRepresentations: number;
    shortfalls: { platformId: string; requested: number; available: number }[];
    /** Universe the sample was drawn from, for context. */
    universeRepresentations: number;
    universeUnderlyings: number;
  };

  /** The read-only probe address and spend token actually used (DEC-028). */
  probeConfig: {
    /**
     * The userWalletAddress sent on every quote. A public burn address, never
     * the owner's wallet, and never signed for. Committed deliberately: it is
     * a well-known public constant, not session data.
     */
    userWalletAddress: string;
    spendTokenAddress: string;
    /** Decimals the amounts were built with, and whether live responses agreed. */
    spendTokenDecimals: number;
    spendTokenSymbolObserved?: string;
    spendTokenDecimalsConfirmedLive: boolean;
    spendSizesUsd: string[];
    /**
     * slippagePercent sent on every /swap call. The Trading API doc page lists
     * both slippagePercent and autoSlippage as optional, but live /swap rejects
     * a request carrying neither with envelope code 40001 "either
     * slippagePercent or autoSlippage is required" (confirmed 2026-09-30).
     * Recorded here because slippage determines the tx's minReceiveAmount, so
     * it is part of what was measured, not an invisible default.
     */
    slippagePercent: string;
  };

  results: RepresentationResult[];
  ttlObservations: TtlObservation[];

  aggregate: {
    representationsAttempted: number;
    /** Representations where at least one spend size produced a route. */
    representationsQuoted: number;
    quoteAttempts: number;
    quoteAttemptsSucceeded: number;
    /** Count per executionMode across every route of every successful quote. */
    executionModeBreakdown: Record<string, number>;
    /** Count per vendorName across every route of every successful quote. */
    vendorBreakdown: Record<string, number>;
    /** Values seen in neither the current doc page's list nor the spec's RFQ vendor list. */
    undocumentedVendors: string[];
    undocumentedExecutionModes: string[];
    swapAttempts: number;
    swapTxPayloads: number;
    swapRfqPayloads: number;
    simulateAttempts: number;
    /** Attempts where the provider returned a status at all (not an error). */
    simulateReturned: number;
    /** Attempts whose returned status was a non-failing one. */
    simulateSucceeded: number;
    simulateByLeg: Record<string, { attempted: number; returned: number; succeeded: number }>;
    /** Envelope codes seen anywhere in the run, with counts. Verbatim. */
    providerCodeBreakdown: Record<string, number>;
  };

  /** Unknown response fields observed, keyed by endpoint - same convention as F001-A. */
  unknownFields: Record<string, string[]>;
  status: TerminalStatus;
  incompleteReasons: string[];
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function bullets(entries: [string, number][]): string[] {
  if (entries.length === 0) return ["- none"];
  return entries.map(([key, count]) => `- ${key}: ${count}`);
}

/** Renders Markdown FROM the JSON report only - never independently computed. */
export function renderMarkdown(report: QuoteFeasibilityReport): string {
  const a = report.aggregate;
  const lines: string[] = [];

  lines.push("# Quote and Simulation Feasibility Probe Report");
  lines.push("");
  lines.push(`- Probe run: \`${report.probeRunId}\``);
  lines.push(`- Status: **${report.status}**`);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Git SHA: \`${report.gitSha}\``);
  lines.push("");

  if (report.status !== "COMPLETE") {
    lines.push("## Incomplete reasons");
    for (const reason of report.incompleteReasons) lines.push(`- ${reason}`);
    lines.push("");
  }

  lines.push("## What was probed");
  lines.push(
    `- Probe wallet address (read-only, never signed for): \`${report.probeConfig.userWalletAddress}\``,
  );
  lines.push(`- Spend token: \`${report.probeConfig.spendTokenAddress}\``);
  lines.push(
    `- Spend token decimals used: ${report.probeConfig.spendTokenDecimals}` +
      ` (confirmed against live responses: ${report.probeConfig.spendTokenDecimalsConfirmedLive ? "yes" : "NO"}` +
      (report.probeConfig.spendTokenSymbolObserved !== undefined
        ? `, symbol observed live: ${report.probeConfig.spendTokenSymbolObserved}`
        : "") +
      ")",
  );
  lines.push(`- Spend sizes (USD): ${report.probeConfig.spendSizesUsd.join(", ")}`);
  lines.push(
    `- slippagePercent sent on every /swap: ${report.probeConfig.slippagePercent} ` +
      `(live /swap rejects a request with neither slippagePercent nor autoSlippage, code 40001, ` +
      `though the doc page lists both as optional)`,
  );
  lines.push(`- Sample seed: \`${report.sampling.seed}\``);
  lines.push(
    `- Representations: ${report.sampling.totalRepresentations} ` +
      `(${report.sampling.multiRepresentationCount} from ${report.sampling.multiRepresentationTickerCount} multi-representation tickers, ` +
      `${report.sampling.singleRepresentationCount} sampled single-representation at ${report.sampling.singleRepPerPlatform}/platform)`,
  );
  lines.push(
    `- Drawn from a universe of ${report.sampling.universeRepresentations} representations / ${report.sampling.universeUnderlyings} underlyings`,
  );
  for (const s of report.sampling.shortfalls) {
    lines.push(
      `- SHORTFALL: ${s.platformId} had only ${s.available} single-representation tickers, ${s.requested} requested`,
    );
  }
  lines.push("");

  lines.push("## Headline answers");
  lines.push(
    `- Representations that quoted at all: ${a.representationsQuoted}/${a.representationsAttempted} (${pct(a.representationsQuoted, a.representationsAttempted)})`,
  );
  lines.push(
    `- Quote attempts that succeeded: ${a.quoteAttemptsSucceeded}/${a.quoteAttempts} (${pct(a.quoteAttemptsSucceeded, a.quoteAttempts)})`,
  );
  lines.push(
    `- /swap payload shapes: ${a.swapTxPayloads} tx (SWAP), ${a.swapRfqPayloads} rfq (RFQ), out of ${a.swapAttempts} attempts`,
  );
  lines.push(
    `- Simulate attempts returning a status: ${a.simulateReturned}/${a.simulateAttempts}; non-failing status: ${a.simulateSucceeded}`,
  );
  lines.push("");

  lines.push("## executionMode breakdown (per route, across every successful quote)");
  lines.push(
    "F001B-spec.md expected 100% RFQ for these tokens, citing the Trading API docs. This section is the empirical answer.",
  );
  for (const line of bullets(Object.entries(a.executionModeBreakdown))) lines.push(line);
  if (a.undocumentedExecutionModes.length > 0) {
    lines.push(`- values outside the documented set: ${a.undocumentedExecutionModes.join(", ")}`);
  }
  lines.push("");

  lines.push("## Vendor breakdown (per route, across every successful quote)");
  for (const line of bullets(Object.entries(a.vendorBreakdown))) lines.push(line);
  if (a.undocumentedVendors.length > 0) {
    lines.push(
      `- vendors in neither the current doc page list nor the spec's RFQ vendor list: ${a.undocumentedVendors.join(", ")}`,
    );
  }
  lines.push("");

  lines.push("## Simulation outcome by leg");
  const legEntries = Object.entries(a.simulateByLeg);
  if (legEntries.length === 0) {
    lines.push("- no simulate call was attempted");
  } else {
    for (const [leg, counts] of legEntries) {
      lines.push(
        `- ${leg}: attempted ${counts.attempted}, returned a status ${counts.returned}, non-failing ${counts.succeeded}`,
      );
    }
  }
  lines.push("");

  lines.push("## Quote TTL and quoteId reuse");
  if (report.ttlObservations.length === 0) {
    lines.push("- no TTL observation was recorded in this run");
  } else {
    for (const t of report.ttlObservations) {
      lines.push(
        `- ${t.platformId} ${t.underlyingTicker} at $${t.spendUsd}, waited ${t.waitSeconds}s:`,
      );
      lines.push(
        `  - reusing the expired quoteId in /swap: ${t.expiredQuoteRejected ? "rejected" : "NOT rejected"}` +
          (t.reuseProviderCode !== undefined ? ` (code ${t.reuseProviderCode})` : "") +
          `, matches documented 40401 QUOTE_EXPIRED: ${t.matchedDocumentedExpiryCode ? "yes" : "no"}`,
      );
      if (t.reuseErrorMessage !== undefined) lines.push(`  - message: ${t.reuseErrorMessage}`);
      if (t.requoted) {
        lines.push(
          `  - re-quote drift: ${t.driftBps ?? "n/a"} bps (${t.firstToTokenAmount ?? "n/a"} -> ${t.requotedToTokenAmount ?? "n/a"})`,
        );
      } else {
        lines.push(`  - re-quote failed: ${t.error ?? "unknown"}`);
      }
    }
  }
  lines.push("");

  lines.push("## Provider envelope codes seen");
  for (const line of bullets(Object.entries(a.providerCodeBreakdown))) lines.push(line);
  lines.push("");

  lines.push("## Per-representation detail");
  for (const r of report.results) {
    lines.push(
      `### ${r.platformId} ${r.tokenSymbol} (${r.underlyingTicker}) \`${r.tokenContractAddress}\` [${r.sampleGroup}]`,
    );
    for (const at of r.attempts) {
      if (!at.quoted) {
        lines.push(
          `- $${at.spendUsd}: no quote` +
            (at.providerCode !== undefined ? ` (code ${at.providerCode})` : "") +
            (at.quoteError !== undefined ? ` - ${at.quoteError}` : ""),
        );
        continue;
      }
      lines.push(
        `- $${at.spendUsd}: ${at.routeCount ?? 0} route(s), modes [${(at.executionModes ?? []).join(", ")}], vendors [${(at.vendorNames ?? []).join(", ")}]`,
      );
      if (at.best) {
        lines.push(
          `  - best (${at.best.isBestFlagged ? "isBest" : "first route, none flagged isBest"}): ${at.best.vendorName} ${at.best.executionMode ?? "?"}, ` +
            `toTokenAmount=${at.best.toTokenAmount}, priceImpact=${at.best.priceImpactPercent ?? "n/a"}, ` +
            `tradeFee=${at.best.tradeFee ?? "n/a"}, estimateGasFee=${at.best.estimateGasFee ?? "n/a"}, ` +
            `approveTarget=${at.best.approveTarget ?? "n/a"}`,
        );
      }
      if (at.swap) {
        lines.push(
          `  - /swap: ${at.swap.succeeded ? "ok" : "failed"}` +
            (at.swap.providerCode !== undefined ? ` (code ${at.swap.providerCode})` : "") +
            (at.swap.succeeded
              ? `, mode=${at.swap.executionMode ?? "?"}, payload=${at.swap.payload ?? "?"}` +
                (at.swap.txFields ? `, tx fields: ${at.swap.txFields.join(", ")}` : "") +
                (at.swap.rfqFields ? `, rfq fields: ${at.swap.rfqFields.join(", ")}` : "")
              : `, ${at.swap.error ?? "unknown error"}`),
        );
      }
      if (at.approve) {
        lines.push(
          `  - /approve-transaction${at.approve.vendor !== undefined ? ` (vendor=${at.approve.vendor})` : ""}: ` +
            (at.approve.succeeded
              ? `ok, spender=${at.approve.spenderAddress ?? "?"}, payload arrived as ${at.approve.payloadShape ?? "?"}`
              : `failed${at.approve.providerCode !== undefined ? ` (code ${at.approve.providerCode})` : ""} - ${at.approve.error ?? "unknown"}`),
        );
      }
      if (at.simulate) {
        const s = at.simulate;
        lines.push(
          `  - simulate ${s.leg} -> ${s.to}: ` +
            (s.returned
              ? `status=${s.status ?? "?"}, failReason=${s.failReason ?? "null"}, ` +
                `balanceChanges=${s.balanceChangeCount ?? 0}, allowanceChanges=${s.allowanceChangeCount ?? 0}`
              : `no status returned${s.providerCode !== undefined ? ` (code ${s.providerCode})` : ""} - ${s.error ?? "unknown"}`),
        );
      }
    }
    lines.push("");
  }

  lines.push("## Unknown fields observed");
  const unknownEntries = Object.entries(report.unknownFields).filter(([, v]) => v.length > 0);
  if (unknownEntries.length === 0) {
    lines.push("- none");
  } else {
    for (const [endpoint, keys] of unknownEntries) lines.push(`- ${endpoint}: ${keys.join(", ")}`);
  }
  lines.push("");

  return lines.join("\n");
}
