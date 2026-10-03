import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { SearchBox } from "@/components/SearchBox";
import { StaleUniverseBanner } from "@/components/Banners";
import { db } from "@/server/db";
import { sampleUnderlyings, snapshotMeta } from "@/server/universe";

export const dynamic = "force-dynamic";

/**
 * Home (F003 T4). The thesis in one screen: search a company, see what Orchard
 * would do. Banking language only - no contract address, DEX name, wrapper
 * selector or slippage control anywhere in the default view.
 */
export default async function HomePage() {
  const pool = db();
  let snapshot: Awaited<ReturnType<typeof snapshotMeta>> | undefined;
  let popular: Awaited<ReturnType<typeof sampleUnderlyings>> = [];
  try {
    snapshot = await snapshotMeta(pool);
    popular = await sampleUnderlyings(pool, 6);
  } catch {
    snapshot = undefined;
  }

  return (
    <>
      <h1>Buy the company, not the ticker plumbing.</h1>
      <p className="muted">
        Orchard compares the supported eligible routes for a tokenized stock or ETF on BNB Chain and
        shows which one returns the most shares for your amount, and why.
      </p>

      <div className="card">
        <SearchBox />
      </div>

      {snapshot === undefined ? (
        <p className="banner stop" role="alert">
          <strong>The company list is unavailable.</strong> The app could not read its universe
          snapshot, so nothing is listed rather than showing a guess.
        </p>
      ) : snapshot.stale ? (
        <StaleUniverseBanner
          ageSeconds={snapshot.ageSeconds}
          maxAgeSeconds={snapshot.maxAgeSeconds}
        />
      ) : null}

      {popular.length > 0 ? (
        <div className="card">
          <h2>Available on more than one platform</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            These have the most supported representations, so there is something to compare.
          </p>
          <ul className="plain">
            {popular.map((item) => (
              <li key={item.ticker}>
                <Link className="result" href={`/stock/${item.ticker}`}>
                  <Avatar name={item.companyName} ticker={item.ticker} />
                  <span className="grow">
                    <strong>{item.companyName}</strong>
                    <br />
                    <span className="small muted">
                      {item.ticker} · {item.assetTypeLabel} · {item.representationCount} supported
                      routes
                    </span>
                  </span>
                  <span aria-hidden="true" className="muted">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snapshot !== undefined && snapshot.snapshotAt !== null ? (
        <p className="tiny muted" data-testid="snapshot-meta">
          Company list: {snapshot.underlyingCount} companies, {snapshot.representationCount}{" "}
          supported representations, refreshed{" "}
          {snapshot.ageSeconds === null ? "unknown" : `${Math.floor(snapshot.ageSeconds / 60)}m`}{" "}
          ago.
        </p>
      ) : null}
    </>
  );
}
