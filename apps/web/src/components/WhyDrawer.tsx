import type { CandidateDto } from "@/server/dto";

/**
 * The "Why this route?" drawer (F003 T4).
 *
 * This is the ONLY place platform names (Ondo, bStock) and route internals
 * appear. The default view stays in banking language; a reader who wants the
 * mechanism opens this.
 *
 * Every number here is a provider or engine decimal string rendered as text.
 * Nothing is recomputed in the browser - there is no float arithmetic in this
 * component at all.
 */

function Metric({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className="mono tiny">{value}</dd>
    </>
  );
}

function bpsLabel(value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${value} bps`;
}

export function WhyDrawer({ candidates }: { candidates: CandidateDto[] }) {
  const accepted = candidates.filter((c) => c.accepted);
  const rejected = candidates.filter((c) => !c.accepted);
  return (
    <details className="why" data-testid="why-drawer">
      <summary>Why this route?</summary>
      <p className="small muted" style={{ marginTop: 10 }}>
        Orchard compares supported eligible routes for the same company and picks the one that
        returns the most shares for your amount, then lower disclosed fees, then the fresher quote,
        then lower price impact. {accepted.length} route
        {accepted.length === 1 ? "" : "s"} met every check; {rejected.length} did not.
      </p>

      {candidates.map((candidate) => (
        <div
          className={candidate.accepted ? "cand" : "cand rejected"}
          key={`${candidate.platform}-${candidate.tokenSymbol}`}
          data-testid={`candidate-${candidate.platform}`}
        >
          <div className="row between">
            <strong>{candidate.platform}</strong>
            <span className={candidate.accepted ? "tag ok" : "tag no"}>
              {candidate.accepted ? "ACCEPTED" : "REJECTED"}
            </span>
          </div>
          <p className="tiny muted" style={{ margin: "2px 0 8px" }}>
            {candidate.tokenSymbol} · {candidate.assetTypeLabel}
          </p>

          <dl className="kv">
            <Metric label="Estimated shares" value={candidate.estimatedShares} />
            <Metric label="Price per share" value={candidate.estimatedPricePerShare} />
            <Metric label="Reference price per share" value={candidate.referencePrice} />
            <Metric label="Deviation from reference" value={bpsLabel(candidate.deviationBps)} />
            <Metric label="Price impact" value={bpsLabel(candidate.priceImpactBps)} />
            <Metric label="Trade fee" value={candidate.tradeFee} />
            <Metric label="Network fee estimate" value={candidate.networkFee} />
            <Metric
              label="Quote age"
              value={
                candidate.quoteAgeSeconds === undefined
                  ? undefined
                  : `${candidate.quoteAgeSeconds}s`
              }
            />
          </dl>

          {candidate.referenceUnavailable ? (
            <p className="tiny" style={{ marginTop: 8 }} data-testid="reference-unavailable">
              <strong>No reference price was available</strong>, so the deviation check could not
              run for this route. That is not the same as a zero deviation.
            </p>
          ) : null}

          {candidate.reasons.length > 0 ? (
            <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {candidate.reasons.map((reason, i) => (
                <li key={reason}>
                  {reason}{" "}
                  <span className="pill" title="The engine's raw reason code">
                    {candidate.reasonCodes[i]}
                    {candidate.providerCodes.length > 0
                      ? ` · provider ${candidate.providerCodes[0]}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </details>
  );
}
