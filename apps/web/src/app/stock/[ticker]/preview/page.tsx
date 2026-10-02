import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewPanel } from "@/components/PreviewPanel";
import { capabilities } from "@/server/api";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { findUnderlying, snapshotMeta } from "@/server/universe";
import { checkAmount, tickerSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

/**
 * Preview (F003 T4).
 *
 * The page itself does NOT run the engine: the client component asks
 * /api/previews, so the request goes through the rate limiter, the
 * single-flight coalescer and the concurrency budget like any other caller.
 * Rendering it server-side would bypass all three.
 *
 * Capabilities are read here and passed down, so the confirm button is driven
 * by what the server reports rather than by a constant in the component.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ amount?: string }>;
}) {
  const { ticker: raw } = await params;
  const { amount: rawAmount } = await searchParams;
  const parsedTicker = tickerSchema.safeParse(decodeURIComponent(raw));
  if (!parsedTicker.success) notFound();

  const env = serverEnv();
  const amount = (rawAmount ?? "").trim();
  const amountCheck = checkAmount(amount, {
    min: env.WEB_MIN_AMOUNT_USDT,
    max: env.WEB_MAX_AMOUNT_USDT,
  });

  const asset = await findUnderlying(db(), parsedTicker.data);
  if (asset === undefined) notFound();

  if (!amountCheck.ok) {
    return (
      <>
        <h1>Preview</h1>
        <p className="banner stop" role="alert" data-testid="invalid-amount">
          <strong>That amount cannot be previewed.</strong> {amountCheck.message}
        </p>
        <Link className="btn secondary" href={`/stock/${asset.ticker}/amount`}>
          Change the amount
        </Link>
      </>
    );
  }

  // Observed, not assumed: the snapshot read below either worked or it did not.
  let rwaDiscovery = false;
  try {
    const meta = await snapshotMeta(db());
    rwaDiscovery = meta.snapshotAt !== null && meta.underlyingCount > 0;
  } catch {
    rwaDiscovery = false;
  }
  // liveQuotes and bestExecution are NOT claimed here: this page has not made a
  // provider call, and the preview request that follows is what establishes
  // them. Claiming them from a page render would be a guess.
  const caps = capabilities({ rwaDiscovery, liveQuotes: false, bestExecution: false });

  return (
    <>
      <h1>Preview</h1>
      <p className="muted" data-testid="preview-subject">
        {asset.companyName} ({asset.ticker}) · {amount} USDT
      </p>
      <PreviewPanel ticker={asset.ticker} amount={amount} capabilities={caps} />
      <p style={{ marginTop: 12 }}>
        <Link className="btn secondary" href={`/stock/${asset.ticker}/amount`}>
          Change the amount
        </Link>
      </p>
    </>
  );
}
