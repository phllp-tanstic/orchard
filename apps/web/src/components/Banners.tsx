/**
 * The honest states (F003 T4). Each one says what happened and, where money
 * is involved, says explicitly that nothing was submitted.
 */
export function StaleUniverseBanner({
  ageSeconds,
  maxAgeSeconds,
}: {
  ageSeconds: number | null;
  maxAgeSeconds: number;
}) {
  return (
    <p className="banner" role="status" data-testid="banner-stale">
      <strong>This company list may be out of date.</strong>{" "}
      {ageSeconds === null
        ? "No completed universe snapshot exists yet."
        : `It was last refreshed ${Math.floor(ageSeconds / 60)} minutes ago; the limit is ${Math.floor(
            maxAgeSeconds / 60,
          )} minutes.`}{" "}
      Prices in a preview are still quoted live at the moment you ask.
    </p>
  );
}

export function MarketClosedBanner() {
  return (
    <p className="banner" role="status" data-testid="banner-market-closed">
      <strong>This market is outside its trading session.</strong> Routes usually cannot be priced
      right now. You can still ask for a preview, and Orchard will tell you exactly what the
      provider said.
    </p>
  );
}

export function NoRouteBanner({ reasons }: { reasons: string[] }) {
  return (
    <div className="banner stop" role="alert" data-testid="banner-no-route">
      <p style={{ margin: "0 0 6px" }}>
        <strong>No eligible route.</strong> No transaction was submitted.
      </p>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

export function BusyBanner() {
  return (
    <p className="banner" role="alert" data-testid="banner-busy">
      <strong>Orchard is at its pricing limit right now.</strong> Nothing was submitted. This app
      runs one server and stays well inside the provider&apos;s request limits on purpose, so please
      try again in a moment.
    </p>
  );
}

export function ProviderUnavailableBanner() {
  return (
    <p className="banner stop" role="alert" data-testid="banner-provider">
      <strong>The pricing provider could not be reached.</strong> No transaction was submitted and
      no price is shown, because a guessed price would be worse than none.
    </p>
  );
}

export function RateLimitedBanner({ message }: { message: string }) {
  return (
    <p className="banner" role="alert" data-testid="banner-rate-limited">
      <strong>Too many previews from this connection.</strong> {message}
    </p>
  );
}
