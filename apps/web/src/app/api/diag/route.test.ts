import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/diag (deployment artifacts, F003 T5 preparation).
 *
 * The two cases that matter most are the ones where the route must NOT answer:
 * disabled (no token configured) and unauthorized (configured, but the caller
 * did not present it). A diagnostic endpoint that leaks is worse than no
 * diagnostic endpoint, so those are tested first and the success case only
 * afterwards, to pin the exact shape of what it does disclose.
 *
 * Nothing is mocked here beyond the environment: the route touches no
 * database and no provider, which is itself part of the contract.
 */

const BASE_ENV: Record<string, string> = {
  BINANCE_WEB3_API_KEY: "(test placeholder, not a key)",
  BINANCE_WEB3_API_SECRET: "(test placeholder, not a secret)",
  BINANCE_WEB3_BASE_URL: "https://web3.binance.com/test",
  TARGET_BINANCE_CHAIN_ID: "56",
  ORCHARD_APP_DATABASE_URL: "postgres://orchard_app:x@127.0.0.1:5432/orchard_test",
  EVIDENCE_REDACTION_SALT: "(test placeholder, not a salt)",
  WEB_TRUSTED_PROXY_HOPS: "1",
  NODE_ENV: "test",
};

/** 24+ characters, as env.ts requires. Obviously not a real token. */
const TOKEN = "SYNTHETIC_diag_token_for_tests_only";
const TOKEN_HEADER = "x-orchard-diag-token";

let savedEnv: NodeJS.ProcessEnv;

async function load(
  overrides: Record<string, string | undefined> = {},
): Promise<(r: NextRequest) => Response> {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const mod = await import("./route");
  return mod.GET as unknown as (r: NextRequest) => Response;
}

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/diag", { headers });
}

beforeEach(() => {
  savedEnv = { ...process.env };
});

afterEach(() => {
  process.env = savedEnv;
  vi.resetModules();
});

describe("GET /api/diag when it is DISABLED", () => {
  it("answers 404 with no token configured, even for a caller presenting one", async () => {
    const GET = await load({ WEB_DIAG_TOKEN: undefined });

    const bare = GET(req());
    expect(bare.status).toBe(404);

    const guessing = GET(req({ [TOKEN_HEADER]: TOKEN }));
    expect(guessing.status).toBe(404);
  });

  it("does not reveal that the route exists or what it would report", async () => {
    const GET = await load({ WEB_DIAG_TOKEN: undefined });
    const body = (await GET(req()).json()) as { error: { code: string; message: string } };

    expect(body.error.code).toBe("NOT_FOUND");
    // No mention of diagnostics, of the header name, or of the variable that
    // would switch it on: a 404 here must be indistinguishable from any other.
    expect(JSON.stringify(body)).not.toMatch(/diag|token|proxy|forwarded/i);
  });
});

describe("GET /api/diag when it is enabled but UNAUTHORIZED", () => {
  it("answers 401 for a missing, wrong, and empty token", async () => {
    const GET = await load({ WEB_DIAG_TOKEN: TOKEN });

    for (const headers of [
      {},
      { [TOKEN_HEADER]: "" },
      { [TOKEN_HEADER]: "wrong" },
      // Same length as the real token, so a length check alone cannot pass it.
      { [TOKEN_HEADER]: "x".repeat(TOKEN.length) },
      // A prefix of the real token.
      { [TOKEN_HEADER]: TOKEN.slice(0, -1) },
    ]) {
      const response = GET(req(headers));
      expect(response.status, `headers ${JSON.stringify(headers)}`).toBe(401);
    }
  });

  it("discloses nothing about the host in the refusal", async () => {
    const GET = await load({ WEB_DIAG_TOKEN: TOKEN });
    const response = GET(req({ "x-forwarded-for": "203.0.113.7, 198.51.100.4" }));
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).not.toContain("203.0.113.7");
    expect(text).not.toContain("198.51.100.4");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(process.version);
  });
});

describe("GET /api/diag when it is enabled and AUTHORIZED", () => {
  it("reports the chain length, derived client IP, hop count and Node version", async () => {
    const GET = await load({ WEB_DIAG_TOKEN: TOKEN, WEB_TRUSTED_PROXY_HOPS: "2" });
    const response = GET(
      req({
        [TOKEN_HEADER]: TOKEN,
        // Three entries: the leftmost is whatever the client claimed.
        "x-forwarded-for": "9.9.9.9, 203.0.113.7, 198.51.100.4",
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body["forwardedChainLength"]).toBe(3);
    // Second from the right, because two proxies are declared.
    expect(body["clientIp"]).toBe("203.0.113.7");
    expect(body["trustedProxyHops"]).toBe(2);
    expect(body["nodeVersion"]).toBe(process.version);
  });

  it("reports only those fields - no header echo and no environment dump", async () => {
    const GET = await load({ WEB_DIAG_TOKEN: TOKEN });
    const response = GET(
      req({ [TOKEN_HEADER]: TOKEN, "x-forwarded-for": "203.0.113.7", cookie: "a=b" }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "clientIp",
      "forwardedChainLength",
      "nodeVersion",
      "note",
      "trustedProxyHops",
    ]);
    const text = JSON.stringify(body);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("a=b");
    expect(text).not.toContain(BASE_ENV["ORCHARD_APP_DATABASE_URL"]);
  });

  it("reports a zero-length chain when no X-Forwarded-For arrives at all", async () => {
    const GET = await load({ WEB_DIAG_TOKEN: TOKEN });
    const body = (await GET(req({ [TOKEN_HEADER]: TOKEN })).json()) as Record<string, unknown>;

    expect(body["forwardedChainLength"]).toBe(0);
    // Not a fabricated address: an origin that cannot be established shares
    // one bucket, and that is what the limiter actually does.
    expect(body["clientIp"]).toBe("unknown");
  });
});
