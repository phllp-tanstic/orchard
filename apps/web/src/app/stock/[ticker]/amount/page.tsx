import { notFound } from "next/navigation";
import { AmountForm } from "@/components/AmountForm";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { findUnderlying } from "@/server/universe";
import { tickerSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

/** Amount entry (F003 T4). Bounds come from the server and are labelled as product defaults. */
export default async function AmountPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const parsed = tickerSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) notFound();

  const asset = await findUnderlying(db(), parsed.data);
  if (asset === undefined) notFound();

  const env = serverEnv();
  return (
    <>
      <h1>How much would you put in?</h1>
      <p className="muted">
        {asset.companyName} ({asset.ticker}) · {asset.assetTypeLabel}
      </p>
      <AmountForm
        ticker={asset.ticker}
        min={env.WEB_MIN_AMOUNT_USDT}
        max={env.WEB_MAX_AMOUNT_USDT}
      />
    </>
  );
}
