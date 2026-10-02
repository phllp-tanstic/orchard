import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/server/api";
import { db } from "@/server/db";
import { searchUnderlyings, snapshotMeta } from "@/server/universe";
import { searchQuerySchema } from "@/server/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/assets?q= (F003 T2 and T3). Searches the STORED universe snapshot
 * by ticker and company name. No provider call per request.
 *
 * The response carries the snapshot age so the UI can show a stale-data
 * banner rather than presenting old data as current.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = searchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] = issue.message;
    return apiError("INVALID_INPUT", "Check the search query.", fields);
  }

  try {
    const pool = db();
    const [results, snapshot] = await Promise.all([
      searchUnderlyings(pool, parsed.data.q, parsed.data.limit),
      snapshotMeta(pool),
    ]);
    if (snapshot.snapshotAt === null) {
      return apiError(
        "SNAPSHOT_UNAVAILABLE",
        "The company list has not been built yet. Run pnpm universe:refresh.",
      );
    }
    return apiOk({ query: parsed.data.q, results, snapshot });
  } catch {
    return apiError("INTERNAL", "Search is temporarily unavailable.");
  }
}
