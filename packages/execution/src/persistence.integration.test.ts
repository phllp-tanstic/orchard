import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createIsolatedDatabase, type IsolatedDatabase } from "@orchard/evidence/testing";
import { openProbeRun } from "@orchard/evidence";
import { defaultPolicy } from "./eligibility.js";
import { persistRun, readStoredDecision } from "./persistence.js";
import { ALGORITHM_VERSION } from "./ranking.js";
import type { RunResult } from "./orchestrator.js";
import type { CandidateRoute } from "./types.js";

/**
 * F002 T5 integration: append-only enforcement on the execution.* tables.
 *
 * DEC-017: this file gets its own database, cloned from the shared template.
 */
let db: IsolatedDatabase;
let migratorPool: Pool;
let appPool: Pool;

beforeAll(async () => {
  db = await createIsolatedDatabase();
  migratorPool = db.migratorPool;
  appPool = db.appPool;
});

afterAll(async () => {
  await db.teardown();
});

const CHAIN = "56";

function candidate(id: string, overrides: Partial<CandidateRoute> = {}): CandidateRoute {
  return {
    id,
    intentId: "intent-1",
    representationId: `${CHAIN}:0x${id}`,
    platformId: "ondo",
    underlyingTicker: "NVDA",
    tokenSymbol: "NVDAon",
    tokenContractAddress: `0x${id}`,
    binanceChainId: CHAIN,
    assetType: 1,
    assetTypeLabel: "Stock",
    tokenToShareRatio: "1",
    quoteProvider: "BINANCE_WEB3",
    quoteId: "q1",
    inputAmount: "100000000000000000000",
    inputAmountDecimal: "100",
    expectedOutputTokenAmount: "1000000000000000000",
    toTokenDecimals: "18",
    normalizedExpectedShares: "1",
    effectivePricePerShare: "100",
    referencePrice: "100",
    referenceDeviationBps: "0",
    priceImpactBps: "1",
    executionMode: "SWAP",
    vendorName: "LiquidMesh",
    quoteTimestamp: "2026-10-02T12:00:00.000Z",
    quoteAgeSeconds: 2,
    eligibility: "ELIGIBLE",
    rejectionReasons: [],
    ...overrides,
  };
}

function runResult(candidates: CandidateRoute[], selectedId: string | null): RunResult {
  const ranked = candidates.filter((c) => c.eligibility === "ELIGIBLE");
  return {
    intentId: "intent-1",
    request: {
      underlyingTicker: "NVDA",
      spendAmountDecimal: "100",
      policy: defaultPolicy(),
      targetChainId: CHAIN,
    },
    spendAmountSmallestUnit: "100000000000000000000",
    candidates,
    ranked,
    decision: {
      intentId: "intent-1",
      selectedCandidateId: selectedId,
      algorithmVersion: ALGORITHM_VERSION,
      rankedCandidateIds: selectedId === null ? [] : ranked.map((c) => c.id),
      reasonCodes: selectedId === null ? ["NON_TRADING_SESSION"] : ["NORMALIZED_SHARES_DESC"],
      decidedAt: "2026-10-02T12:00:02.000Z",
      outcome: selectedId === null ? "NO_ELIGIBLE_ROUTE" : "SELECTED",
    },
  };
}

async function newProbeRun(): Promise<string> {
  return openProbeRun(appPool, { gitSha: "test", clientVersion: "f002-integration" });
}

describe("execution.* persistence", () => {
  it("stores a request, its candidates and its decision in one transaction", async () => {
    const probeRunId = await newProbeRun();
    const cands = [candidate("aaa"), candidate("bbb", { normalizedExpectedShares: "0.9" })];
    const persisted = await persistRun(appPool, {
      probeRunId,
      result: runResult(cands, "aaa"),
    });

    const stored = await readStoredDecision(appPool, persisted.executionRequestId);
    expect(stored?.outcome).toBe("SELECTED");
    expect(stored?.candidateCount).toBe(2);
    expect(stored?.eligibleCount).toBe(2);
    expect(stored?.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(stored?.selectedCandidateId).toBe(persisted.candidateRowIds.get("aaa"));
  });

  it("stores a NO_ELIGIBLE_ROUTE decision with no selection and every reason", async () => {
    const probeRunId = await newProbeRun();
    const rejected = candidate("ccc", {
      eligibility: "REJECTED",
      rejectionReasons: [{ code: "NON_TRADING_SESSION", providerCode: "40367" }],
    });
    const persisted = await persistRun(appPool, {
      probeRunId,
      result: runResult([rejected], null),
    });
    const stored = await readStoredDecision(appPool, persisted.executionRequestId);
    expect(stored?.outcome).toBe("NO_ELIGIBLE_ROUTE");
    expect(stored?.selectedCandidateId).toBeNull();
    expect(stored?.eligibleCount).toBe(0);
    expect(stored?.reasonCodes).toEqual(["NON_TRADING_SESSION"]);
  });

  it("links every candidate to its evidence.provider_call row when given one", async () => {
    const probeRunId = await newProbeRun();
    const call = await appPool.query<{ id: string }>(
      `INSERT INTO evidence.provider_call
         (probe_run_id, provider, method, endpoint, latency_ms, response_sha256, raw_response)
       VALUES ($1,'binance','GET','/build/api/v1/dex/aggregator/quote',10,'abc','\\x00')
       RETURNING id`,
      [probeRunId],
    );
    const providerCallId = call.rows[0]!.id;
    const persisted = await persistRun(appPool, {
      probeRunId,
      result: runResult([candidate("ddd", { providerCallId })], "ddd"),
    });
    const res = await appPool.query(
      `SELECT provider_call_id FROM execution.candidate_route WHERE execution_request_id = $1`,
      [persisted.executionRequestId],
    );
    expect((res.rows[0] as { provider_call_id: string }).provider_call_id).toBe(providerCallId);
  });
});

describe("execution.* is append-only (no exceptions)", () => {
  async function seed(): Promise<{ requestId: string; candidateId: string; decisionId: string }> {
    const probeRunId = await newProbeRun();
    const persisted = await persistRun(appPool, {
      probeRunId,
      result: runResult([candidate("eee")], "eee"),
    });
    return {
      requestId: persisted.executionRequestId,
      candidateId: persisted.candidateRowIds.get("eee")!,
      decisionId: persisted.routeDecisionId,
    };
  }

  // Two independent layers protect these tables, and the role determines which
  // one you hit first. orchard_app has no UPDATE/DELETE grant at all, so it is
  // refused by privilege before the trigger runs; the migrator DOES have the
  // privilege, so it reaches the append-only trigger. Both are rejections, and
  // asserting the right one per role is what proves the layering.
  it("refuses UPDATE for orchard_app by privilege, and for the migrator by the trigger", async () => {
    const { requestId, candidateId, decisionId } = await seed();
    const statements: [string, unknown[]][] = [
      [`UPDATE execution.execution_request SET underlying_ticker='X' WHERE id=$1`, [requestId]],
      [`UPDATE execution.candidate_route SET eligibility='REJECTED' WHERE id=$1`, [candidateId]],
      [`UPDATE execution.route_decision SET outcome='NO_ELIGIBLE_ROUTE' WHERE id=$1`, [decisionId]],
    ];
    for (const [sql, params] of statements) {
      await expect(appPool.query(sql, params)).rejects.toThrow(/permission denied/);
      await expect(migratorPool.query(sql, params)).rejects.toThrow(/append-only/);
    }
  });

  it("refuses DELETE for orchard_app by privilege, and for the migrator by the trigger", async () => {
    const { requestId, candidateId, decisionId } = await seed();
    const statements: [string, unknown[]][] = [
      [`DELETE FROM execution.route_decision WHERE id=$1`, [decisionId]],
      [`DELETE FROM execution.candidate_route WHERE id=$1`, [candidateId]],
      [`DELETE FROM execution.execution_request WHERE id=$1`, [requestId]],
    ];
    for (const [sql, params] of statements) {
      await expect(appPool.query(sql, params)).rejects.toThrow(/permission denied/);
      await expect(migratorPool.query(sql, params)).rejects.toThrow(/append-only/);
    }
  });

  it("refuses TRUNCATE on the table nothing references, via the append-only trigger", async () => {
    await seed();
    // route_decision has no inbound foreign key, so TRUNCATE reaches the
    // trigger rather than being stopped by referential integrity first. This
    // is the case that actually proves the TRUNCATE trigger fires.
    await expect(migratorPool.query(`TRUNCATE execution.route_decision`)).rejects.toThrow(
      /append-only/,
    );
  });

  it("refuses TRUNCATE on the referenced tables too, by one layer or the other", async () => {
    await seed();
    for (const table of ["execution.candidate_route", "execution.execution_request"]) {
      // Either the append-only trigger or foreign-key protection refuses it.
      // Both are correct; what matters is that TRUNCATE can never succeed.
      await expect(migratorPool.query(`TRUNCATE ${table}`)).rejects.toThrow(
        /append-only|cannot truncate a table referenced/,
      );
    }
  });

  it("grants orchard_app only SELECT and INSERT on execution.*", async () => {
    const res = await migratorPool.query<{ privilege_type: string }>(
      `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
        WHERE table_schema='execution' AND grantee='orchard_app' ORDER BY privilege_type`,
    );
    expect(res.rows.map((r) => r.privilege_type)).toEqual(["INSERT", "SELECT"]);
  });

  it("has row level security enabled on every table", async () => {
    const res = await migratorPool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='execution' AND c.relkind='r' ORDER BY c.relname`,
    );
    expect(res.rows).toHaveLength(3);
    for (const row of res.rows) expect(row.relrowsecurity).toBe(true);
  });
});

describe("execution.* constraints keep a row honest", () => {
  it("refuses an ELIGIBLE candidate that carries rejection reasons", async () => {
    const probeRunId = await newProbeRun();
    const bad = candidate("fff", {
      eligibility: "ELIGIBLE",
      rejectionReasons: [{ code: "QUOTE_STALE" }],
    });
    await expect(
      persistRun(appPool, { probeRunId, result: runResult([bad], "fff") }),
    ).rejects.toThrow(/candidate_route_verdict_matches_reasons/);
  });

  it("refuses a REJECTED candidate with no reason", async () => {
    const probeRunId = await newProbeRun();
    const bad = candidate("ggg", { eligibility: "REJECTED", rejectionReasons: [] });
    await expect(
      persistRun(appPool, { probeRunId, result: runResult([bad], null) }),
    ).rejects.toThrow(/candidate_route_verdict_matches_reasons/);
  });

  it("refuses a SELECTED decision with no selected candidate", async () => {
    const probeRunId = await newProbeRun();
    const result = runResult([candidate("hhh")], "hhh");
    result.decision.selectedCandidateId = null;
    result.decision.outcome = "SELECTED";
    await expect(persistRun(appPool, { probeRunId, result })).rejects.toThrow();
  });

  it("rolls back the whole run when one candidate insert fails", async () => {
    const probeRunId = await newProbeRun();
    const good = candidate("iii");
    const bad = candidate("jjj", {
      eligibility: "ELIGIBLE",
      rejectionReasons: [{ code: "QUOTE_STALE" }],
    });
    await expect(
      persistRun(appPool, { probeRunId, result: runResult([good, bad], "iii") }),
    ).rejects.toThrow();
    // Nothing from this probe run survives: no partial decision without its candidates.
    const res = await appPool.query<{ count: string }>(
      `SELECT count(*) FROM execution.execution_request WHERE probe_run_id=$1`,
      [probeRunId],
    );
    expect(Number(res.rows[0]!.count)).toBe(0);
  });
});
