import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { middleware, config as middlewareConfig } from "../middleware";

/**
 * The response headers (F003 hardening item 7).
 *
 * These were already set, and this pins them: a header that silently
 * disappears in a config refactor is invisible until someone frames the app or
 * sniffs a response body. Two places are checked, because the headers live in
 * two places for a reason - the static ones in next.config.ts, the
 * per-request CSP in middleware.
 */

async function staticHeaders(): Promise<Map<string, string>> {
  const headerFn = nextConfig.headers;
  expect(typeof headerFn, "next.config.ts must declare a headers() function").toBe("function");
  const groups = await (headerFn as NonNullable<typeof headerFn>)();
  const all = new Map<string, string>();
  for (const group of groups) {
    // Every group must apply to all paths, or a header could be set on one
    // route and quietly missing on another.
    expect(group.source).toBe("/:path*");
    for (const h of group.headers) all.set(h.key.toLowerCase(), h.value);
  }
  return all;
}

describe("static security headers (next.config.ts)", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    // Without this a browser may re-interpret a JSON error as HTML and run it.
    expect((await staticHeaders()).get("x-content-type-options")).toBe("nosniff");
  });

  it("sets Referrer-Policy: no-referrer", async () => {
    // The path carries the ticker someone looked at. It must not leak.
    expect((await staticHeaders()).get("referrer-policy")).toBe("no-referrer");
  });

  it("sets a Permissions-Policy that denies the sensitive features", async () => {
    const value = (await staticHeaders()).get("permissions-policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(value, feature).toContain(`${feature}=()`);
    }
  });

  it("sets HSTS for at least a year, including subdomains", async () => {
    const value = (await staticHeaders()).get("strict-transport-security") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(value)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(value).toContain("includeSubDomains");
  });

  it("refuses framing and cross-origin resource sharing of the page", async () => {
    const headers = await staticHeaders();
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("does not advertise the framework", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("allows no remote image host", async () => {
    // An empty list means a remote URL is rejected rather than proxied.
    expect(nextConfig.images?.remotePatterns).toEqual([]);
  });

  it("does NOT set the CSP statically, because it must vary per request", async () => {
    expect((await staticHeaders()).has("content-security-policy")).toBe(false);
  });
});

describe("per-request CSP (middleware)", () => {
  function run(): { csp: string; nonce: string } {
    const response = middleware(new NextRequest("http://localhost/"));
    const csp = response.headers.get("content-security-policy") ?? "";
    return { csp, nonce: /'nonce-([^']+)'/.exec(csp)?.[1] ?? "" };
  }

  it("sets a CSP with a nonce on every response", () => {
    const { csp, nonce } = run();
    expect(nonce.length).toBeGreaterThan(10);
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
  });

  it("issues a DIFFERENT nonce per request, or the nonce is decoration", () => {
    const nonces = new Set([run().nonce, run().nonce, run().nonce]);
    expect(nonces.size).toBe(3);
  });

  it("names no third-party origin in any directive", () => {
    // F003 T4 forbids third-party images, fonts, scripts, analytics and
    // trackers. An allowlisted host here would be the first crack in that.
    const { csp } = run();
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).not.toContain("*");
  });

  it("locks down the directives that matter", () => {
    const { csp } = run();
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "upgrade-insecure-requests",
    ]) {
      expect(csp, directive).toContain(directive);
    }
  });

  it("never allows unsafe-inline or unsafe-eval for SCRIPTS", () => {
    // style-src does carry unsafe-inline - Next injects inline <style> and
    // offers no nonce hook for it - but a script must never be inline-allowed.
    const { csp } = run();
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("passes the nonce to Next on the REQUEST, not only the response", () => {
    // Next stamps its own inline bootstrap scripts from the request header. If
    // this were response-only, a strict CSP would break the app.
    const response = middleware(new NextRequest("http://localhost/"));
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-nonce");
  });

  it("runs on pages and API routes, and skips static assets", () => {
    // The matcher is already a path regex; anchoring it is the whole
    // translation. Rewriting it beyond that tests the rewrite, not the config.
    const pattern = new RegExp(`^${middlewareConfig.matcher[0] ?? ""}$`);
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/api/previews")).toBe(true);
    expect(pattern.test("/stock/NVDA/preview")).toBe(true);
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
    expect(pattern.test("/_next/image")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
  });
});
