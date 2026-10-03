import { timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, trustedProxyHops } from "@/server/api";
import { serverEnv } from "@/server/env";
import { clientIpOf } from "@/server/guards";

export const dynamic = "force-dynamic";

/** The header the token is presented in. Not a cookie: this is never a browser flow. */
const TOKEN_HEADER = "x-orchard-diag-token";

/**
 * Constant-time comparison that does not leak the expected length either.
 * `timingSafeEqual` throws on a length mismatch, so both sides are hashed to a
 * fixed width first - cheaper than it sounds and it removes the length oracle.
 */
function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still do a comparison of equal length so the refusal costs the same time.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * GET /api/diag - a measurement of the HOST, not of the app.
 *
 * WEB_TRUSTED_PROXY_HOPS decides which X-Forwarded-For entry the rate limiter
 * treats as the client. Set it too low and a visitor can mint a fresh bucket
 * per request by sending their own header; set it too high and every request
 * collapses into one shared bucket. The correct value is a property of the
 * deployment - how many proxies the platform puts in front of this process -
 * and no host document states it reliably. This endpoint reports what actually
 * arrives so the value can be chosen from evidence rather than guessed.
 *
 * It is DISABLED unless WEB_DIAG_TOKEN is set, and when disabled it answers
 * exactly as an unknown path would (404 NOT_FOUND), so its existence is not
 * advertised by a deployment that has not enabled it.
 *
 * The response carries only four things, and deliberately nothing else: the
 * LENGTH of the forwarded chain (never its contents, which are client-supplied
 * text and could carry anything), the client IP the limiter derives, the
 * configured hop count, and the Node version. No environment dump, no header
 * echo, no connection string, no provider state.
 *
 * Not rate limited, on purpose. The read limiter keys on the very IP
 * derivation this endpoint exists to diagnose, so a misconfiguration would
 * collapse every caller into one bucket and rate-limit the tool needed to see
 * it. The protection is the token, which env.ts requires to be at least 24
 * characters. docs/DEPLOYMENT.md says to unset it after the first check.
 */
export function GET(request: NextRequest): NextResponse {
  const env = serverEnv();
  const expected = env.WEB_DIAG_TOKEN;
  if (expected === undefined) {
    return apiError("NOT_FOUND", "Not found.");
  }

  const presented = request.headers.get(TOKEN_HEADER);
  if (presented === null || !tokenMatches(presented, expected)) {
    return apiError("UNAUTHORIZED", `A valid ${TOKEN_HEADER} header is required.`);
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const forwardedChainLength =
    forwarded === null || forwarded.trim() === ""
      ? 0
      : forwarded
          .split(",")
          .map((e) => e.trim())
          .filter((e) => e !== "").length;

  const hops = trustedProxyHops();

  return apiOk({
    forwardedChainLength,
    clientIp: clientIpOf(request.headers, hops),
    trustedProxyHops: hops,
    nodeVersion: process.version,
    note:
      "Host measurement only. If forwardedChainLength is consistently N, set " +
      "WEB_TRUSTED_PROXY_HOPS to N, then UNSET WEB_DIAG_TOKEN to remove this route.",
  });
}
