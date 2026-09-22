import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { exportEvidence } from "./export.js";

function fakePool(rows: unknown[]): Pool {
  return { query: async () => ({ rows }) } as unknown as Pool;
}

describe("exportEvidence", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "orchard-evidence-export-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes one redacted artifact per provider_call row, keyed by response_sha256, and appends the manifest", async () => {
    const rows = [
      {
        id: "call-1",
        probe_run_id: "run-1",
        provider: "binance",
        method: "GET",
        endpoint: "/build/api/v1/dex/market/rwa/platforms",
        redacted_request: { query: { userWalletAddress: "sha256:abc" } },
        http_status: 200,
        provider_code: "0",
        latency_ms: 12,
        rate_limit_headers: { "x-oc-ratelimit-remaining": "199" },
        response_sha256: "deadbeef",
        response_json: { code: "0" },
        created_at: "2026-09-21T00:00:00.000Z",
      },
    ];
    const result = await exportEvidence(fakePool(rows), "run-1", dir);

    expect(result.exportedCount).toBe(1);
    const files = await readdir(join(dir, "export"));
    expect(files).toEqual(["deadbeef.json"]);

    const artifact = JSON.parse(await readFile(join(dir, "export", "deadbeef.json"), "utf8"));
    expect(artifact.redacted_request.query.userWalletAddress).toBe("sha256:abc");
    expect(artifact).not.toHaveProperty("raw_response");

    const manifest = (await readFile(join(dir, "manifest.jsonl"), "utf8")).trim().split("\n");
    expect(manifest).toHaveLength(1);
    const line = JSON.parse(manifest[0]!);
    expect(line).toEqual({
      provider: "binance",
      endpoint: "/build/api/v1/dex/market/rwa/platforms",
      status: 200,
      provider_code: "0",
      latency_ms: 12,
      sha256: "deadbeef",
      timestamp: "2026-09-21T00:00:00.000Z",
      run_id: "run-1",
    });
  });

  it("writes nothing when the run has no provider_call rows", async () => {
    const result = await exportEvidence(fakePool([]), "run-empty", dir);
    expect(result.exportedCount).toBe(0);
    const files = await readdir(join(dir, "export"));
    expect(files).toEqual([]);
  });
});
