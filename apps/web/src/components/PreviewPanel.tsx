"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PreviewDto } from "@/server/dto";
import type { Capabilities } from "@/server/api";
import { BusyBanner, NoRouteBanner, ProviderUnavailableBanner, RateLimitedBanner } from "./Banners";
import { ConfirmButton } from "./ConfirmButton";
import { WhyDrawer } from "./WhyDrawer";

/**
 * The preview (F003 T4): a live countdown to expiry, a Refresh that requotes,
 * and every honest state.
 *
 * The countdown is display only. Whether a preview may be USED is decided
 * server-side on the next request; this component never serves a stale result
 * as if it were current - once the countdown reaches zero it says "expired"
 * and offers Refresh rather than silently continuing to show the numbers as
 * live.
 *
 * All amounts are rendered as the exact strings the server sent. No float
 * arithmetic happens here.
 */

type ErrorState =
  | { kind: "none" }
  | { kind: "BUSY" }
  | { kind: "PROVIDER_UNAVAILABLE" }
  | { kind: "RATE_LIMITED"; message: string }
  | { kind: "OTHER"; message: string };

function secondsLeft(expiresAt: string | undefined, now: number): number | undefined {
  if (expiresAt === undefined) return undefined;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return undefined;
  return Math.max(0, Math.round((end - now) / 1000));
}

export function PreviewPanel({
  ticker,
  amount,
  capabilities,
  initial,
}: {
  ticker: string;
  amount: string;
  capabilities: Capabilities;
  initial?: PreviewDto | undefined;
}) {
  const [preview, setPreview] = useState<PreviewDto | undefined>(initial);
  const [error, setError] = useState<ErrorState>({ kind: "none" });
  const [loading, setLoading] = useState(initial === undefined);
  const [now, setNow] = useState<number>(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError({ kind: "none" });
    try {
      const res = await fetch("/api/previews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, amount }),
      });
      if (res.ok) {
        setPreview((await res.json()) as PreviewDto);
        setNow(Date.now());
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        const code = body.error?.code ?? "OTHER";
        const message = body.error?.message ?? "That preview could not be completed.";
        if (code === "BUSY") setError({ kind: "BUSY" });
        else if (code === "PROVIDER_UNAVAILABLE") setError({ kind: "PROVIDER_UNAVAILABLE" });
        else if (code === "RATE_LIMITED") setError({ kind: "RATE_LIMITED", message });
        else setError({ kind: "OTHER", message });
        setPreview(undefined);
      }
    } catch {
      setError({ kind: "PROVIDER_UNAVAILABLE" });
      setPreview(undefined);
    } finally {
      setLoading(false);
    }
  }, [ticker, amount]);

  useEffect(() => {
    if (initial === undefined) void load();
  }, [initial, load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = useMemo(() => secondsLeft(preview?.expiresAt, now), [preview, now]);
  const expired = remaining !== undefined && remaining <= 0;

  if (loading && preview === undefined) {
    return (
      <div className="card" aria-busy="true" data-testid="preview-loading">
        <p className="muted">Asking the provider for live quotes…</p>
      </div>
    );
  }

  if (error.kind === "BUSY") return <BusyBannerWithRetry onRetry={load} />;
  if (error.kind === "PROVIDER_UNAVAILABLE")
    return (
      <>
        <ProviderUnavailableBanner />
        <button type="button" className="secondary" onClick={() => void load()}>
          Try again
        </button>
      </>
    );
  if (error.kind === "RATE_LIMITED") return <RateLimitedBanner message={error.message} />;
  if (error.kind === "OTHER")
    return (
      <p className="banner stop" role="alert" data-testid="banner-other">
        {error.message}
      </p>
    );
  if (preview === undefined) return null;

  const noRoute = preview.outcome === "NO_ELIGIBLE_ROUTE";

  return (
    <div data-testid="preview">
      {noRoute ? <NoRouteBanner reasons={preview.decisionReasons} /> : null}

      {!noRoute && preview.winner !== undefined ? (
        <div className="card" data-testid="preview-winner">
          <h2>
            {preview.companyName} <span className="pill">{preview.assetTypeLabel}</span>
          </h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Estimated for {preview.amount} {preview.spendAssetSymbol}
          </p>
          <p className="big" data-testid="estimated-shares">
            {preview.winner.estimatedShares}
          </p>
          <p className="muted small" style={{ marginTop: -6 }}>
            estimated shares
          </p>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Estimated price per share</dt>
            <dd className="mono" data-testid="price-per-share">
              {preview.winner.estimatedPricePerShare}
            </dd>
            {preview.winner.tradeFee !== undefined ? (
              <>
                <dt>Disclosed trade fee</dt>
                <dd className="mono">{preview.winner.tradeFee}</dd>
              </>
            ) : null}
            {preview.winner.networkFee !== undefined ? (
              <>
                <dt>Network fee estimate</dt>
                <dd className="mono">{preview.winner.networkFee}</dd>
              </>
            ) : null}
          </dl>
          <p className="small muted" style={{ marginTop: 10 }} data-testid="decision-reason">
            {preview.decisionReasons.join(" ")}
          </p>
        </div>
      ) : null}

      <div className="card row between" data-testid="freshness">
        <div className="grow">
          {remaining === undefined ? (
            <span className="small muted">No quote timestamp was returned.</span>
          ) : expired ? (
            <span className="small" data-testid="countdown-expired">
              <strong>This quote has expired.</strong> Refresh for a current one.
            </span>
          ) : (
            <span className="small" data-testid="countdown">
              Quote valid for <strong>{remaining}s</strong>
            </span>
          )}
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => void load()}
          data-testid="refresh"
        >
          Refresh
        </button>
      </div>

      <WhyDrawer candidates={preview.candidates} />

      <div className="card" style={{ marginTop: 12 }}>
        <ConfirmButton
          mainnetExecution={capabilities.mainnetExecution}
          reason={capabilities.details.executionNotLiveReason}
        />
      </div>

      {preview.executionRequestId !== undefined ? (
        <p className="tiny muted" data-testid="execution-request-id">
          Decision recorded as execution_request {preview.executionRequestId} (algorithm{" "}
          {preview.algorithmVersion}).
        </p>
      ) : null}
    </div>
  );
}

function BusyBannerWithRetry({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
    <>
      <BusyBanner />
      <button type="button" className="secondary" onClick={() => void onRetry()}>
        Try again
      </button>
    </>
  );
}
