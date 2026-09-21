import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { ProviderCallRecord } from "@orchard/binance";
import { redactRequestParams, DEFAULT_SENSITIVE_PARAMS, type RedactOptions } from "./redact.js";
import { ProbeRunAlreadyTerminalError, isTerminalEventConflict } from "./errors.js";

export type TerminalStatus = "COMPLETE" | "INCOMPLETE" | "FAILED";

export interface OpenProbeRunArgs {
  gitSha: string;
  clientVersion: string;
}

/**
 * Inserts the probe_run header and its RUNNING event in one transaction, per
 * DEC-010 (Spec Amendment A1, docs/DECISIONS.md). Returns the new run id.
 */
export async function openProbeRun(pool: Pool, args: OpenProbeRunArgs): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const header = await client.query<{ id: string }>(
      `INSERT INTO evidence.probe_run (git_sha, client_version) VALUES ($1, $2) RETURNING id`,
      [args.gitSha, args.clientVersion],
    );
    const probeRunId = header.rows[0]!.id;
    await client.query(
      `INSERT INTO evidence.probe_run_event (probe_run_id, status) VALUES ($1, 'RUNNING')`,
      [probeRunId],
    );
    await client.query("COMMIT");
    return probeRunId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface CloseProbeRunArgs {
  probeRunId: string;
  status: TerminalStatus;
  incompleteReasons?: readonly string[];
}

/**
 * Inserts a terminal event for a run. Throws ProbeRunAlreadyTerminalError
 * (rather than a raw pg error) if the run already has a terminal event -
 * the DB trigger evidence.reject_event_after_terminal() enforces this, this
 * function just gives callers a typed error to catch.
 */
export async function closeProbeRun(pool: Pool, args: CloseProbeRunArgs): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO evidence.probe_run_event (probe_run_id, status, incomplete_reasons)
       VALUES ($1, $2, $3)`,
      [
        args.probeRunId,
        args.status,
        args.incompleteReasons ? JSON.stringify(args.incompleteReasons) : null,
      ],
    );
  } catch (err) {
    if (isTerminalEventConflict(err)) {
      throw new ProbeRunAlreadyTerminalError(args.probeRunId, err);
    }
    throw err;
  }
}

export interface ProbeRunCurrent {
  probeRunId: string;
  startedAt: string;
  gitSha: string;
  clientVersion: string;
  status: "RUNNING" | TerminalStatus;
  incompleteReasons: readonly string[] | null;
  finishedAt: string | null;
}

/** Reads evidence.probe_run_current for one run. Never reports COMPLETE without a COMPLETE event. */
export async function getProbeRunCurrent(
  pool: Pool,
  probeRunId: string,
): Promise<ProbeRunCurrent | undefined> {
  const result = await pool.query(
    `SELECT probe_run_id, started_at, git_sha, client_version, status, incomplete_reasons, finished_at
     FROM evidence.probe_run_current WHERE probe_run_id = $1`,
    [probeRunId],
  );
  const row = result.rows[0] as
    | {
        probe_run_id: string;
        started_at: string;
        git_sha: string;
        client_version: string;
        status: "RUNNING" | TerminalStatus;
        incomplete_reasons: readonly string[] | null;
        finished_at: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    probeRunId: row.probe_run_id,
    startedAt: row.started_at,
    gitSha: row.git_sha,
    clientVersion: row.client_version,
    status: row.status,
    incompleteReasons: row.incomplete_reasons,
    finishedAt: row.finished_at,
  };
}

/** A run is only ever reported COMPLETE if its terminal event says so - never inferred. */
export async function isRunReportableComplete(pool: Pool, probeRunId: string): Promise<boolean> {
  const current = await getProbeRunCurrent(pool, probeRunId);
  return current?.status === "COMPLETE";
}

export type RecordProviderCallOptions = RedactOptions;

/**
 * Persists one provider_call row from a packages/binance ProviderCallRecord.
 * Request query/body are redacted per the configured sensitive-param list
 * before storage (spec T3). raw_response stores the exact response bytes as
 * received; when the HTTP call never got a response (networkError), that's
 * zero bytes - the true "exact bytes received" - and the network error
 * message is preserved in response_json instead of a fabricated body.
 */
export async function recordProviderCall(
  pool: Pool,
  probeRunId: string,
  record: ProviderCallRecord,
  options: RecordProviderCallOptions,
): Promise<string> {
  const redactedRequest = buildRedactedRequest(record.requestQuery, record.requestBody, options);
  const rawBytes = Buffer.from(record.rawResponseBody ?? "", "utf8");
  const responseSha256 = createHash("sha256").update(rawBytes).digest("hex");
  const responseJson =
    record.responseJson !== undefined
      ? record.responseJson
      : record.networkError !== undefined
        ? { networkError: record.networkError }
        : null;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO evidence.provider_call
      (probe_run_id, provider, method, endpoint, redacted_request, http_status, provider_code,
       latency_ms, rate_limit_headers, response_sha256, raw_response, response_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      probeRunId,
      record.provider,
      record.method,
      record.endpoint,
      JSON.stringify(redactedRequest),
      record.httpStatus ?? null,
      record.providerCode ?? null,
      record.latencyMs,
      JSON.stringify(record.rateLimitHeaders),
      responseSha256,
      rawBytes,
      responseJson === null ? null : JSON.stringify(responseJson),
    ],
  );
  return result.rows[0]!.id;
}

function buildRedactedRequest(
  query: ProviderCallRecord["requestQuery"],
  body: unknown,
  options: RecordProviderCallOptions,
): { query: Record<string, unknown> | undefined; body: unknown } {
  const sensitiveParams = options.sensitiveParams ?? DEFAULT_SENSITIVE_PARAMS;
  const redactedQuery =
    query !== undefined
      ? redactRequestParams(query as Record<string, unknown>, { ...options, sensitiveParams })
      : undefined;
  const redactedBody =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? redactRequestParams(body as Record<string, unknown>, { ...options, sensitiveParams })
      : body;
  return { query: redactedQuery, body: redactedBody };
}
