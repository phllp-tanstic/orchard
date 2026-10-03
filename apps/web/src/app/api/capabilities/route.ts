import type { NextRequest, NextResponse } from "next/server";
import {
  apiOk,
  capabilities,
  enforceRateLimit,
  readRateLimiter,
  type Capabilities,
} from "@/server/api";
import { db } from "@/server/db";
import { providerReachability } from "@/server/provider-health";
import { snapshotMeta } from "@/server/universe";

export const dynamic = "force-dynamic";

/**
 * GET /api/capabilities (F003 T2, hardened). Flags are computed from what this
 * process can actually do, never hardcoded. The UI reads these and never
 * assumes a feature is live.
 *
 * rwaDiscovery   - a COMPLETE universe snapshot is readable from the database.
 * liveQuotes     - the provider answered an authenticated call with code 0.
 * bestExecution  - both of the above, because ranking needs a universe AND a
 *                  live quote; claiming it on either alone would overstate it.
 *
 * The provider observation comes from the shared cache, and its `checkedAt`
 * and `ageSeconds` are reported alongside the flags. A cached observation is
 * still an observation - but the reader is told how old it is instead of
 * having to assume it was taken now.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<Capabilities> | NextResponse> {
  const limit = enforceRateLimit(request, readRateLimiter, "requests");
  if (limit.response !== undefined) return limit.response;

  let rwaDiscovery = false;
  try {
    const meta = await snapshotMeta(db());
    rwaDiscovery = meta.snapshotAt !== null && meta.underlyingCount > 0;
  } catch {
    rwaDiscovery = false;
  }

  const provider = await providerReachability();
  const liveQuotes = provider.value.ok;

  return apiOk(
    capabilities({
      rwaDiscovery,
      liveQuotes,
      bestExecution: rwaDiscovery && liveQuotes,
      providerCheckedAt: provider.checkedAt,
      providerCheckAgeSeconds: provider.ageSeconds,
      providerCheckFresh: provider.fresh,
    }),
    limit.headers,
  );
}
