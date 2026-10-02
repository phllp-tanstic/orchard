import { NextResponse } from "next/server";
import { BinanceWeb3Client } from "@orchard/binance";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { snapshotMeta } from "@/server/universe";

export const dynamic = "force-dynamic";

/**
 * GET /api/health (F003 T2): database reachability, provider reachability and
 * universe freshness. Each is MEASURED on this request; nothing is cached and
 * nothing is assumed healthy.
 *
 * The provider check is one read-only /rwa/platforms call - the cheapest
 * authenticated endpoint - so health does not burn the quote budget.
 */
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, { ok: boolean; detail?: string; latencyMs?: number }> = {};

  let databaseOk = false;
  const dbStart = Date.now();
  try {
    await db().query("SELECT 1");
    databaseOk = true;
    checks["database"] = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks["database"] = {
      ok: false,
      // The message is sanitised: a connection string must never reach a
      // response body, and pg puts the host in some error messages.
      detail: err instanceof Error ? err.name : "unknown error",
      latencyMs: Date.now() - dbStart,
    };
  }

  let providerOk = false;
  let providerCode: string | undefined;
  const provStart = Date.now();
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
    providerCode = String(res.envelope.code);
    providerOk = providerCode === "0";
    checks["provider"] = {
      ok: providerOk,
      detail: `code ${providerCode}`,
      latencyMs: Date.now() - provStart,
    };
  } catch (err) {
    checks["provider"] = {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
      latencyMs: Date.now() - provStart,
    };
  }

  let snapshot: Awaited<ReturnType<typeof snapshotMeta>> | undefined;
  if (databaseOk) {
    try {
      snapshot = await snapshotMeta(db());
      checks["universe"] = {
        ok: snapshot.snapshotAt !== null && !snapshot.stale,
        detail:
          snapshot.snapshotAt === null
            ? "no COMPLETE snapshot run exists yet"
            : `${snapshot.underlyingCount} underlyings, age ${snapshot.ageSeconds}s, max ${snapshot.maxAgeSeconds}s`,
      };
    } catch {
      checks["universe"] = { ok: false, detail: "snapshot query failed" };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      ok,
      checks,
      snapshot: snapshot ?? null,
      // Deliberately NOT a version string pulled from package.json: that would
      // imply a release process this feature does not have.
      note: "Read-only app. Nothing here signs, submits or broadcasts a transaction.",
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
