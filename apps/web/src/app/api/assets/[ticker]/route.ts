import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, enforceRateLimit, readRateLimiter } from "@/server/api";
import { db } from "@/server/db";
import { findUnderlying, representationsOf, snapshotMeta } from "@/server/universe";
import { tickerSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/assets/[ticker] (F003 T2): one underlying with its asset type
 * (Stock or ETF), market status, and how many supported representations exist.
 *
 * Representation COUNT is public here. The platform names and contract
 * addresses are not part of the default view (F003 T4) - they belong to the
 * "Why this route?" drawer, which reads them from the preview response.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
): Promise<NextResponse> {
  const limit = enforceRateLimit(request, readRateLimiter, "requests");
  if (limit.response !== undefined) return limit.response;

  const { ticker: raw } = await context.params;
  const parsed = tickerSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("INVALID_INPUT", "That is not a valid ticker.", {
      ticker: parsed.error.issues[0]?.message ?? "invalid",
    });
  }

  try {
    const pool = db();
    const [underlying, snapshot] = await Promise.all([
      findUnderlying(pool, parsed.data),
      snapshotMeta(pool),
    ]);
    if (underlying === undefined) {
      return apiError("NOT_FOUND", `Orchard does not support ${parsed.data} today.`);
    }
    const representations = await representationsOf(pool, parsed.data);
    return apiOk(
      {
        asset: {
          ticker: underlying.ticker,
          companyName: underlying.companyName,
          assetTypeLabel: underlying.assetTypeLabel,
          representationCount: underlying.representationCount,
          marketStatuses: underlying.marketStatuses,
          anyMarketOpen: underlying.anyMarketOpen,
          // Every stored representation reports its own market status; a null is
          // reported as null rather than guessed as open or closed (DEC-020:
          // bStock returns a null marketStatus).
          marketStatusByPlatform: representations.map((r) => ({
            platform: r.platformId,
            marketStatus: r.marketStatus,
          })),
        },
        snapshot,
      },
      limit.headers,
    );
  } catch {
    return apiError("INTERNAL", "That company could not be loaded.");
  }
}
