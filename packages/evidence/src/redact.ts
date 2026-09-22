import { createHash } from "node:crypto";

/** Request params redacted to a salted sha256 before storage in evidence.redacted_request. */
export const DEFAULT_SENSITIVE_PARAMS: readonly string[] = ["userWalletAddress", "address"];

export interface RedactOptions {
  salt: string;
  sensitiveParams?: readonly string[];
}

/**
 * Redacts sensitive keys in a flat request-params object to
 * `sha256(salt + ":" + key + "=" + String(value))`, hex-encoded. Any other
 * key/value is passed through unchanged. Nested objects/arrays are redacted
 * shallowly at the top level only (the params objects this is applied to -
 * query params, JSON bodies - are flat by construction for this API).
 */
export function redactRequestParams(
  params: Record<string, unknown>,
  options: RedactOptions,
): Record<string, unknown> {
  const { salt, sensitiveParams = DEFAULT_SENSITIVE_PARAMS } = options;
  const sensitiveSet = new Set(sensitiveParams);
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (sensitiveSet.has(key)) {
      out[key] = `sha256:${hashParam(salt, key, value)}`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function hashParam(salt: string, key: string, value: unknown): string {
  return createHash("sha256")
    .update(`${salt}:${key}=${String(value)}`)
    .digest("hex");
}
