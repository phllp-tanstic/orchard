import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { MarketClosedBanner, StaleUniverseBanner } from "@/components/Banners";
import { db } from "@/server/db";
import { findUnderlying, snapshotMeta } from "@/server/universe";
import { tickerSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

/**
 * Stock detail (F003 T4). Company, asset type, market status and how many
 * supported routes exist. No platform name, contract address or DEX name here:
 * those live in the "Why this route?" drawer on the preview.
 */
export default async function StockPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const parsed = tickerSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) notFound();

  const pool = db();
  const [asset, snapshot] = await Promise.all([
    findUnderlying(pool, parsed.data),
    snapshotMeta(pool),
  ]);
  if (asset === undefined) {
    return (
      <>
        <h1>{parsed.data}</h1>
        <p className="banner stop" role="alert" data-testid="unsupported">
          <strong>Orchard does not support {parsed.data} today.</strong> It is not in the list of
          tokenized companies this app can price.
        </p>
        <Link className="btn secondary" href="/explore">
          Browse what is supported
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <Avatar name={asset.companyName} ticker={asset.ticker} />
        <div className="grow">
          <h1 style={{ margin: 0 }}>{asset.companyName}</h1>
          <p className="small muted" style={{ margin: 0 }}>
            {asset.ticker} · {asset.assetTypeLabel}
          </p>
        </div>
      </div>

      {snapshot.stale ? (
        <StaleUniverseBanner
          ageSeconds={snapshot.ageSeconds}
          maxAgeSeconds={snapshot.maxAgeSeconds}
        />
      ) : null}

      {!asset.anyMarketOpen ? <MarketClosedBanner /> : null}

      <div className="card">
        <dl className="kv">
          <dt>Asset type</dt>
          <dd data-testid="asset-type">{asset.assetTypeLabel}</dd>
          <dt>Supported routes Orchard can compare</dt>
          <dd data-testid="representation-count">{asset.representationCount}</dd>
          <dt>Market status</dt>
          <dd data-testid="market-status">
            {asset.marketStatuses.length === 0 ? "not reported" : asset.marketStatuses.join(", ")}
          </dd>
        </dl>
      </div>

      <Link className="btn" href={`/stock/${asset.ticker}/amount`} data-testid="to-amount">
        Enter an amount
      </Link>
    </>
  );
}
