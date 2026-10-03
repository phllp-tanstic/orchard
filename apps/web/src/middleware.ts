import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a nonce (F003 T1).
 *
 * Next's App Router emits inline bootstrap and streaming-payload scripts. The
 * options are `script-src 'unsafe-inline'`, which defeats most of the point of
 * a CSP, or a per-request nonce. Next applies the nonce to its own inline
 * scripts automatically when it finds one in the CSP header on the request, so
 * the nonce route is both stricter and supported.
 *
 * CSP lives HERE and not in next.config.ts precisely because it must vary per
 * request; the static headers that never vary stay in next.config.ts, and the
 * two sets do not overlap.
 *
 * No third-party origin appears in any directive: F003 T4 forbids third-party
 * images, fonts, scripts, analytics and trackers, so every source is 'self',
 * 'none' or a nonce rather than an allowlist.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // `strict-dynamic` lets Next's nonced bootstrap load its own chunks without
    // naming every path, while still refusing anything a third party injects.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next injects inline <style> for its CSS; there is no nonce hook for those.
    "style-src 'self' 'unsafe-inline'",
    // data: is needed only for the inline SVG initials avatars. No remote hosts.
    "img-src 'self' data:",
    "font-src 'self'",
    // Same-origin only: the browser talks to this app's own API and nothing else.
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next reads the nonce back out of this header to stamp its inline scripts.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Static assets are already covered by the headers in next.config.ts and do
  // not need a per-request nonce; excluding them keeps the middleware off the
  // hot path for files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
