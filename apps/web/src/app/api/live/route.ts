import type { NextResponse } from "next/server";
import { apiOk } from "@/server/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/live - the LIVENESS probe (F003 hardening item 1).
 *
 * It touches nothing: no database query, no provider call, no environment
 * read, no rate limit. It answers 200 if and only if this process is running
 * and able to serve a request, which is the only question a host's liveness
 * check should ask.
 *
 * Keeping it separate from /api/health matters in both directions. A host
 * pointed at /api/health would RESTART the app whenever the provider or the
 * database had a bad minute, turning somebody else's outage into a restart
 * loop. And a liveness probe that made a provider call would quietly spend the
 * per-key request budget on polling, several times a minute, forever.
 *
 * /api/health remains the readiness answer: it reports every dependency and
 * returns 503 when one is down.
 */
export function GET(): NextResponse {
  return apiOk({
    live: true,
    note: "Process liveness only. This endpoint checks no dependency - see /api/health for readiness.",
  });
}
