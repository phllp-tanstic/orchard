import { z } from "zod";

/**
 * Server-only environment validation (F003 T1). Fails CLOSED: a missing or
 * malformed value throws at boot rather than letting the app start and
 * discover the problem on a user's request.
 *
 * Nothing in here may ever be imported from a client component. The
 * `server-only` guard below makes that a build error rather than a review
 * question, and the bundle-scan test is the second line of defence.
 */
import "server-only";

/** A plain unsigned decimal, the same shape the engine accepts for money. */
const plainDecimal = /^(0|[1-9]\d*)(\.\d+)?$/;

const schema = z.object({
  // --- provider credentials. Server-side only, never sent to a browser.
  BINANCE_WEB3_API_KEY: z.string().min(1, "BINANCE_WEB3_API_KEY is required"),
  BINANCE_WEB3_API_SECRET: z.string().min(1, "BINANCE_WEB3_API_SECRET is required"),
  BINANCE_WEB3_BASE_URL: z.string().url("BINANCE_WEB3_BASE_URL must be a URL"),
  TARGET_BINANCE_CHAIN_ID: z.string().regex(/^\d+$/, "TARGET_BINANCE_CHAIN_ID must be numeric"),

  // --- evidence store
  ORCHARD_APP_DATABASE_URL: z
    .string()
    .min(1, "ORCHARD_APP_DATABASE_URL is required")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "ORCHARD_APP_DATABASE_URL must be a postgres connection string",
    }),
  EVIDENCE_REDACTION_SALT: z.string().min(1, "EVIDENCE_REDACTION_SALT is required"),

  // --- read-only probe wallet. A public burn address; nothing is ever signed
  // for it. Validated as an address so a typo cannot silently become a quote
  // for someone else's wallet.
  PROBE_WALLET_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "PROBE_WALLET_ADDRESS must be a 0x-prefixed 20-byte address")
    .default("0x000000000000000000000000000000000000dEaD"),

  // --- product defaults, all overridable and all labelled as product defaults
  // in the UI and in /api/capabilities rather than presented as measured limits.
  WEB_MIN_AMOUNT_USDT: z.string().regex(plainDecimal).default("5"),
  WEB_MAX_AMOUNT_USDT: z.string().regex(plainDecimal).default("1000"),
  WEB_SNAPSHOT_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(6 * 60 * 60),
  /** Per-IP request budget for the preview endpoint. */
  WEB_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  WEB_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  /**
   * Process-wide ceiling on previews in flight. The provider allows 5 req/s
   * per endpoint and a preview costs one quote PER representation, so public
   * traffic must be bounded well below that (F003 T2).
   */
  WEB_MAX_CONCURRENT_PREVIEWS: z.coerce.number().int().positive().default(2),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/**
 * Parses and caches the environment. Throws a message that names the offending
 * variables and NEVER echoes their values - an error page or a log line must
 * not become the place a secret leaks.
 */
export function serverEnv(): ServerEnv {
  if (cached !== undefined) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = [
      ...new Set(parsed.error.issues.map((i) => i.path.join(".")).filter((n) => n.length > 0)),
    ].sort();
    throw new Error(
      `Invalid server environment. Offending variables: ${names.join(", ") || "(unknown)"}. ` +
        "Values are deliberately not shown. See .env.example for the required names.",
    );
  }
  const env = parsed.data;
  // A max below a min would silently reject every amount, so catch it at boot
  // rather than as a confusing per-request validation failure.
  if (Number(env.WEB_MAX_AMOUNT_USDT) <= Number(env.WEB_MIN_AMOUNT_USDT)) {
    throw new Error(
      "Invalid server environment: WEB_MAX_AMOUNT_USDT must be greater than WEB_MIN_AMOUNT_USDT.",
    );
  }
  cached = env;
  return cached;
}

/** Test-only reset so a test can exercise failure paths. Never called in production code. */
export function resetServerEnvForTests(): void {
  cached = undefined;
}

/** The env schema, exported so a test can assert the shape without booting the app. */
export const serverEnvSchema = schema;
