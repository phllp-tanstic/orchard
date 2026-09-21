import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { ProviderCallRecord } from "@orchard/binance";
import {
  openProbeRun,
  closeProbeRun,
  getProbeRunCurrent,
  isRunReportableComplete,
  recordProviderCall,
} from "./recorder.js";
import { ProbeRunAlreadyTerminalError } from "./errors.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for integration tests`);
  return value;
}

const migratorPool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
const appPool = new Pool({ connectionString: requireEnv("ORCHARD_APP_DATABASE_URL") });

afterAll(async () => {
  await migratorPool.end();
  await appPool.end();
});

function sampleCallRecord(overrides: Partial<ProviderCallRecord> = {}): ProviderCallRecord {
  return {
    provider: "binance",
    method: "GET",
    endpoint: "/build/api/v1/dex/market/rwa/platforms",
    attempt: 1,
    httpStatus: 200,
    providerCode: "0",
    latencyMs: 42,
    rateLimitHeaders: { "x-oc-ratelimit-remaining": "199" },
    networkError: undefined,
    timestamp: new Date().toISOString(),
    requestQuery: { userWalletAddress: "0xDEADBEEF", binanceChainId: 56 },
    requestBody: undefined,
    rawResponseBody: JSON.stringify({ code: "0", data: { hello: "world" } }),
    responseJson: { code: "0", data: { hello: "world" } },
    ...overrides,
  };
}

describe("evidence recorder (integration, real Postgres)", () => {
  it("opens a run by inserting the header and RUNNING event atomically", async () => {
    const probeRunId = await openProbeRun(appPool, {
      gitSha: "integration-test",
      clientVersion: "0.0.0-test",
    });
    expect(probeRunId).toBeTruthy();

    const current = await getProbeRunCurrent(appPool, probeRunId);
    expect(current?.status).toBe("RUNNING");
    expect(current?.finishedAt).toBeNull();
  });

  it("accepts a terminal event and reports it via probe_run_current", async () => {
    const probeRunId = await openProbeRun(appPool, {
      gitSha: "integration-test",
      clientVersion: "0.0.0-test",
    });
    await closeProbeRun(appPool, { probeRunId, status: "COMPLETE" });

    const current = await getProbeRunCurrent(appPool, probeRunId);
    expect(current?.status).toBe("COMPLETE");
    expect(current?.finishedAt).not.toBeNull();
    expect(await isRunReportableComplete(appPool, probeRunId)).toBe(true);
  });

  it("rejects any event after a terminal event, surfaced as ProbeRunAlreadyTerminalError", async () => {
    const probeRunId = await openProbeRun(appPool, {
      gitSha: "integration-test",
      clientVersion: "0.0.0-test",
    });
    await closeProbeRun(appPool, {
      probeRunId,
      status: "INCOMPLETE",
      incompleteReasons: ["reconciliation mismatch"],
    });

    await expect(
      closeProbeRun(appPool, { probeRunId, status: "FAILED" }),
    ).rejects.toBeInstanceOf(ProbeRunAlreadyTerminalError);

    // status must not have regressed
    const current = await getProbeRunCurrent(appPool, probeRunId);
    expect(current?.status).toBe("INCOMPLETE");
    expect(await isRunReportableComplete(appPool, probeRunId)).toBe(false);
  });

  it("never reports COMPLETE for a run with no terminal event", async () => {
    const probeRunId = await openProbeRun(appPool, {
      gitSha: "integration-test",
      clientVersion: "0.0.0-test",
    });
    expect(await isRunReportableComplete(appPool, probeRunId)).toBe(false);
  });

  describe("append-only enforcement (evidence.probe_run / probe_run_event)", () => {
    it("rejects UPDATE, DELETE and TRUNCATE on probe_run even as the owning role", async () => {
      await openProbeRun(appPool, { gitSha: "x", clientVersion: "0.0.0-test" });
      await expect(
        migratorPool.query(`UPDATE evidence.probe_run SET git_sha = 'tampered' WHERE true`),
      ).rejects.toThrow(/append-only/);
      await expect(
        migratorPool.query(`DELETE FROM evidence.probe_run WHERE true`),
      ).rejects.toThrow(/append-only/);
      // probe_run is referenced by other evidence/rwa tables' FKs, so a plain
      // TRUNCATE is refused by Postgres's own referential-integrity check
      // before any trigger runs; CASCADE forces it through to prove our
      // append-only trigger itself also rejects it, independent of FKs.
      await expect(migratorPool.query(`TRUNCATE evidence.probe_run`)).rejects.toThrow(
        /referenced in a foreign key constraint/,
      );
      await expect(migratorPool.query(`TRUNCATE evidence.probe_run CASCADE`)).rejects.toThrow(
        /append-only/,
      );
    });

    it("rejects UPDATE, DELETE and TRUNCATE on probe_run_event even as the owning role", async () => {
      const probeRunId = await openProbeRun(appPool, { gitSha: "x", clientVersion: "0.0.0-test" });
      await expect(
        migratorPool.query(
          `UPDATE evidence.probe_run_event SET status = 'FAILED' WHERE probe_run_id = $1`,
          [probeRunId],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        migratorPool.query(`DELETE FROM evidence.probe_run_event WHERE probe_run_id = $1`, [
          probeRunId,
        ]),
      ).rejects.toThrow(/append-only/);
      await expect(migratorPool.query(`TRUNCATE evidence.probe_run_event`)).rejects.toThrow(
        /append-only/,
      );
    });

    it("orchard_app can INSERT but not UPDATE or DELETE probe_run/probe_run_event", async () => {
      await expect(
        appPool.query(`UPDATE evidence.probe_run SET git_sha = 'x' WHERE true`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        appPool.query(`DELETE FROM evidence.probe_run_event WHERE true`),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("provider_call recording", () => {
    it("redacts sensitive request params and stores exact response bytes + hash", async () => {
      const probeRunId = await openProbeRun(appPool, {
        gitSha: "integration-test",
        clientVersion: "0.0.0-test",
      });
      const record = sampleCallRecord();

      const callId = await recordProviderCall(appPool, probeRunId, record, {
        salt: "integration-test-salt",
      });
      expect(callId).toBeTruthy();

      const row = await appPool.query(
        `SELECT redacted_request, response_sha256, raw_response, response_json, http_status
         FROM evidence.provider_call WHERE id = $1`,
        [callId],
      );
      const stored = row.rows[0] as {
        redacted_request: { query: Record<string, unknown> };
        response_sha256: string;
        raw_response: Buffer;
        response_json: unknown;
        http_status: number;
      };

      expect(String(stored.redacted_request.query["userWalletAddress"])).toMatch(/^sha256:/);
      expect(String(stored.redacted_request.query["userWalletAddress"])).not.toContain(
        "0xDEADBEEF",
      );
      expect(stored.redacted_request.query["binanceChainId"]).toBe(56);
      expect(stored.raw_response.toString("utf8")).toBe(record.rawResponseBody);
      expect(stored.response_json).toEqual(record.responseJson);
      expect(stored.http_status).toBe(200);
    });

    it("rejects UPDATE, DELETE and TRUNCATE on provider_call even as the owning role", async () => {
      const probeRunId = await openProbeRun(appPool, { gitSha: "x", clientVersion: "0.0.0-test" });
      await recordProviderCall(appPool, probeRunId, sampleCallRecord(), {
        salt: "integration-test-salt",
      });
      await expect(
        migratorPool.query(`UPDATE evidence.provider_call SET provider_code = 'x' WHERE true`),
      ).rejects.toThrow(/append-only/);
      await expect(
        migratorPool.query(`DELETE FROM evidence.provider_call WHERE true`),
      ).rejects.toThrow(/append-only/);
      // provider_call is referenced by rwa.*_snapshot FKs - same reasoning
      // as probe_run above.
      await expect(migratorPool.query(`TRUNCATE evidence.provider_call`)).rejects.toThrow(
        /referenced in a foreign key constraint/,
      );
      await expect(migratorPool.query(`TRUNCATE evidence.provider_call CASCADE`)).rejects.toThrow(
        /append-only/,
      );
    });

    it("stores empty raw_response bytes and the network error message when there was no HTTP response", async () => {
      const probeRunId = await openProbeRun(appPool, { gitSha: "x", clientVersion: "0.0.0-test" });
      const record = sampleCallRecord({
        httpStatus: undefined,
        providerCode: undefined,
        rawResponseBody: undefined,
        responseJson: undefined,
        networkError: "ECONNRESET",
      });
      const callId = await recordProviderCall(appPool, probeRunId, record, {
        salt: "integration-test-salt",
      });
      const row = await appPool.query(
        `SELECT raw_response, response_json FROM evidence.provider_call WHERE id = $1`,
        [callId],
      );
      const stored = row.rows[0] as { raw_response: Buffer; response_json: unknown };
      expect(stored.raw_response.length).toBe(0);
      expect(stored.response_json).toEqual({ networkError: "ECONNRESET" });
    });
  });

  it("evidence.probe_run_current view returns the correct latest status for an unrelated random id (no row)", async () => {
    const current = await getProbeRunCurrent(appPool, randomUUID());
    expect(current).toBeUndefined();
  });
});
