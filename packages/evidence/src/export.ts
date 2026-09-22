import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export interface ProviderCallRow {
  id: string;
  probe_run_id: string;
  provider: string;
  method: string;
  endpoint: string;
  redacted_request: unknown;
  http_status: number | null;
  provider_code: string | null;
  latency_ms: number;
  rate_limit_headers: unknown;
  response_sha256: string;
  response_json: unknown;
  created_at: string;
}

export interface ExportResult {
  runId: string;
  exportedCount: number;
  exportDir: string;
  manifestPath: string;
}

/**
 * `pnpm evidence:export --run <id>`. Writes one redacted artifact per
 * evidence.provider_call row for the run to evidence/export/<sha256>.json
 * and appends one manifest.jsonl line per artifact. Export only - never
 * git-adds or commits; the owner reviews and commits evidence/manifest.jsonl
 * by hand (spec T3).
 */
export async function exportEvidence(
  pool: Pool,
  runId: string,
  evidenceDir: string,
): Promise<ExportResult> {
  const rows = await fetchProviderCalls(pool, runId);
  const exportDir = join(evidenceDir, "export");
  await mkdir(exportDir, { recursive: true });

  const manifestLines: string[] = [];
  for (const row of rows) {
    const artifactPath = join(exportDir, `${row.response_sha256}.json`);
    const artifact = {
      id: row.id,
      probe_run_id: row.probe_run_id,
      provider: row.provider,
      method: row.method,
      endpoint: row.endpoint,
      redacted_request: row.redacted_request,
      http_status: row.http_status,
      provider_code: row.provider_code,
      latency_ms: row.latency_ms,
      rate_limit_headers: row.rate_limit_headers,
      response_sha256: row.response_sha256,
      response_json: row.response_json,
      created_at: row.created_at,
    };
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    manifestLines.push(
      JSON.stringify({
        provider: row.provider,
        endpoint: row.endpoint,
        status: row.http_status,
        provider_code: row.provider_code,
        latency_ms: row.latency_ms,
        sha256: row.response_sha256,
        timestamp: row.created_at,
        run_id: row.probe_run_id,
      }),
    );
  }

  const manifestPath = join(evidenceDir, "manifest.jsonl");
  if (manifestLines.length > 0) {
    await appendFile(manifestPath, `${manifestLines.join("\n")}\n`, "utf8");
  }

  return { runId, exportedCount: rows.length, exportDir, manifestPath };
}

async function fetchProviderCalls(pool: Pool, runId: string): Promise<ProviderCallRow[]> {
  const result = await pool.query<ProviderCallRow>(
    `SELECT id, probe_run_id, provider, method, endpoint, redacted_request, http_status,
            provider_code, latency_ms, rate_limit_headers, response_sha256, response_json, created_at
     FROM evidence.provider_call
     WHERE probe_run_id = $1
     ORDER BY created_at ASC`,
    [runId],
  );
  return result.rows;
}
