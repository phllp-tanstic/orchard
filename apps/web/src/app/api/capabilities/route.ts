import type { NextResponse } from "next/server";
import { BinanceWeb3Client } from "@orchard/binance";
import { apiOk, capabilities, type Capabilities } from "@/server/api";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { snapshotMeta } from "@/server/universe";

export const dynamic = "force-dynamic";

/**
 * GET /api/capabilities (F003 T2). Flags are computed at runtime from what
 * this process can actually do right now. The UI reads these and never
 * hardcodes a feature as live.
 *
 * rwaDiscovery   - a COMPLETE universe snapshot is readable from the database.
 * liveQuotes     - the provider answered an authenticated call with code 0.
 * bestExecution  - both of the above, because ranking needs a universe AND a
 *                  live quote; claiming it on either alone would overstate it.
 */
export async function GET(): Promise<NextResponse<Capabilities>> {
  let rwaDiscovery = false;
  try {
    const meta = await snapshotMeta(db());
    rwaDiscovery = meta.snapshotAt !== null && meta.underlyingCount > 0;
  } catch {
    rwaDiscovery = false;
  }

  let liveQuotes = false;
  try {
    const env = serverEnv();
    const client = new BinanceWeb3Client({
      apiKey: env.BINANCE_WEB3_API_KEY,
      apiSecret: env.BINANCE_WEB3_API_SECRET,
      baseUrl: env.BINANCE_WEB3_BASE_URL,
    });
    const res = await client.request<unknown>({
      method: "GET",
      path: "/api/v1/dex/market/rwa/platforms",
    });
    liveQuotes = String(res.envelope.code) === "0";
  } catch {
    liveQuotes = false;
  }

  return apiOk(
    capabilities({ rwaDiscovery, liveQuotes, bestExecution: rwaDiscovery && liveQuotes }),
  );
}
