import type { NextConfig } from "next";

/**
 * DEC-040: Next.js run as a STANDALONE Node server, not serverless. The
 * provider rate limit is per key and the limiter is in-process, so F003
 * section 4 requires exactly one server instance; a serverless deployment
 * would fan out into many isolated limiters.
 */

/**
 * Standalone output copies traced dependencies by creating SYMLINKS, which
 * Windows refuses without elevated privileges (EPERM). Deployment and CI are
 * Linux, so they get the standalone server DEC-040 requires; a Windows
 * developer machine falls back to the ordinary build so that next build, the
 * bundle-secret scan and the browser tests all still run locally.
 *
 * This changes HOW the app is packaged, never what it does. Set
 * ORCHARD_WEB_FORCE_STANDALONE=1 to demand it regardless of platform.
 */
const standalone =
  process.env["ORCHARD_WEB_FORCE_STANDALONE"] === "1" || process.platform !== "win32";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" as const } : {}),
  /**
   * The workspace libraries are consumed as TypeScript SOURCE, not as built
   * output, so Next has to compile them.
   */
  transpilePackages: [
    "@orchard/binance",
    "@orchard/evidence",
    "@orchard/execution",
    "@orchard/rwa",
  ],
  reactStrictMode: true,
  poweredByHeader: false,
  // No remote images are ever loaded (F003 T4). Leaving this empty means a
  // remote URL would be rejected rather than silently proxied.
  images: { remotePatterns: [] },
  /**
   * Those libraries target NodeNext, so their relative imports are written
   * `./errors.js` while the file on disk is `errors.ts`. webpack resolves
   * the literal string and fails. extensionAlias teaches it the NodeNext
   * convention instead of making the libraries drop a correct extension that
   * node itself requires.
   */
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
