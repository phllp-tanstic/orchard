import type { NextRequest, NextResponse } from "next/server";
import { apiJson, enforceRateLimit, readRateLimiter } from "@/server/api";
import { db } from "@/server/db";
import { providerReachability } from "@/server/provider-health";
import { snapshotMeta } from "@/server/universe";

export const dynamic = "force-dynamic";

/**
 * GET /api/health (F003 T2, hardened): database reachability, provider
 * reachability and universe freshness.
 *
 * The database and snapshot checks run on EVERY request - they are local and
 * cheap. The provider check comes from the shared cache in provider-health, so
 * /api/health and /api/capabilities cost one authenticated call between them
 * rather than one each, and a polling monitor cannot burn the provider budget.
 * `checkedAt` and `ageSeconds` travel with it, so a cached observation is
 * never presented as a fresh one.
 *
 * This endpoint is READINESS: it answers 503 when a dependency is down, which
 * is what a load balancer should act on. /api/live is the liveness probe and
 * touches nothing.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const limit = enforceRateLimit(request, readRateLimiter, "health checks");
  if (limit.response !== undefined) return limit.response;

  const checks: Record<
    string,
    { ok: boolean; detail?: string; latencyMs?: number; checkedAt?: string; ageSeconds?: number }
  > = {};

  let databaseOk = false;
  const dbStart = Date.now();
  const dbCheckedAt = new Date();
  try {
    await db().query("SELECT 1");
    databaseOk = true;
    checks["database"] = {
      ok: true,
      latencyMs: Date.now() - dbStart,
      checkedAt: dbCheckedAt.toISOString(),
      ageSeconds: 0,
    };
  } catch (err) {
    checks["database"] = {
      ok: false,
      // The message is sanitised: a connection string must never reach a
      // response body, and pg puts the host in some error messages.
      detail: err instanceof Error ? err.name : "unknown error",
      latencyMs: Date.now() - dbStart,
      checkedAt: dbCheckedAt.toISOString(),
      ageSeconds: 0,
    };
  }

  const provider = await providerReachability();
  checks["provider"] = {
    ok: provider.value.ok,
    detail: provider.value.detail,
    latencyMs: provider.value.latencyMs,
    checkedAt: provider.checkedAt.toISOString(),
    ageSeconds: provider.ageSeconds,
  };

  let snapshot: Awaited<ReturnType<typeof snapshotMeta>> | undefined;
  if (databaseOk) {
    const snapCheckedAt = new Date();
    try {
      snapshot = await snapshotMeta(db());
      checks["universe"] = {
        ok: snapshot.snapshotAt !== null && !snapshot.stale,
        detail:
          snapshot.snapshotAt === null
            ? "no COMPLETE snapshot run exists yet"
            : `${snapshot.underlyingCount} underlyings, age ${snapshot.ageSeconds}s, max ${snapshot.maxAgeSeconds}s`,
        checkedAt: snapCheckedAt.toISOString(),
        ageSeconds: 0,
      };
    } catch {
      checks["universe"] = {
        ok: false,
        detail: "snapshot query failed",
        checkedAt: snapCheckedAt.toISOString(),
        ageSeconds: 0,
      };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  const body = {
    ok,
    // The oldest observation in this response. A reader should judge the whole
    // answer by its weakest leg, the same rule the preview expiry uses.
    checkedAt: provider.checkedAt.toISOString(),
    ageSeconds: Math.max(...Object.values(checks).map((c) => c.ageSeconds ?? 0)),
    checks,
    snapshot: snapshot ?? null,
    // Deliberately NOT a version string pulled from package.json: that would
    // imply a release process this feature does not have.
    note: "Read-only app. Nothing here signs, submits or broadcasts a transaction.",
  };

  // 503 when a dependency is down: that is the signal a load balancer acts on,
  // and the body still carries every measurement behind the verdict.
  return apiJson(body, ok ? 200 : 503, limit.headers);
}
