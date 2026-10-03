import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SearchBox } from "@/components/SearchBox";
import { StaleUniverseBanner } from "@/components/Banners";
import { db } from "@/server/db";
import { searchUnderlyings, sampleUnderlyings, snapshotMeta } from "@/server/universe";

export const dynamic = "force-dynamic";

/**
 * Explore (F003 T4). Search results from the stored snapshot. An empty result
 * says so plainly instead of showing an unrelated suggestion.
 *
 * This page also owns the "that was a ticker" shortcut, because it is the
 * first place in the request with the company list in hand: a query that is
 * EXACTLY one result's ticker jumps straight to that company, and anything
 * else stays here as a list. The search box cannot make that call - it has no
 * list, so it would have to guess from the shape of the word.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const pool = db();

  let snapshot: Awaited<ReturnType<typeof snapshotMeta>> | undefined;
  let results: Awaited<ReturnType<typeof searchUnderlyings>> = [];
  let failed = false;
  try {
    snapshot = await snapshotMeta(pool);
    results =
      query === "" ? await sampleUnderlyings(pool, 25) : await searchUnderlyings(pool, query, 25);
  } catch {
    failed = true;
  }

  // Outside the try: redirect() signals by throwing, so catching it here would
  // swallow the navigation and render "search is unavailable" instead.
  const exact = results.find((r) => r.ticker.toLowerCase() === query.toLowerCase());
  if (exact !== undefined) redirect(`/stock/${exact.ticker}`);

  return (
    <>
      <h1>Explore companies</h1>
      <div className="card">
        <SearchBox initial={query} />
      </div>

      {failed ? (
        <p className="banner stop" role="alert">
          <strong>Search is unavailable.</strong> The company list could not be read.
        </p>
      ) : null}

      {snapshot !== undefined && snapshot.stale ? (
        <StaleUniverseBanner
          ageSeconds={snapshot.ageSeconds}
          maxAgeSeconds={snapshot.maxAgeSeconds}
        />
      ) : null}

      {!failed && results.length === 0 ? (
        <p className="card" data-testid="no-results">
          {query === ""
            ? "No companies are in the list yet."
            : `Nothing in Orchard's supported list matches "${query}".`}
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="card">
          <ul className="plain" data-testid="results">
            {results.map((item) => (
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
    </>
  );
}
