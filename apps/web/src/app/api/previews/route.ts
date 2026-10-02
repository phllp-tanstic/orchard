import type { NextRequest, NextResponse } from "next/server";
import {
  BudgetExhaustedError,
  apiError,
  apiOk,
  previewBudget,
  previewFlight,
  previewRateLimiter,
} from "@/server/api";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { clientIpOf } from "@/server/guards";
import { ProviderUnavailableError, UnknownTickerError, runPreview } from "@/server/preview";
import { checkAmount, previewBodySchema } from "@/server/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/previews (F003 T2). Validates server-side, runs the F002 engine
 * with the DEFAULT policy, and returns a UI-safe result.
 *
 * Protection, in the order it is applied:
 *  1. per-IP rate limit   - one visitor cannot monopolise the provider budget;
 *  2. single-flight       - identical concurrent requests share one run, so a
 *                           refresh storm costs one set of provider calls;
 *  3. concurrency budget  - a process-wide ceiling that REJECTS rather than
 *                           queues, because a queued request would sit until
 *                           its quote expired and then serve something stale.
 *
 * A result is never served after its oldest quote exceeds maxQuoteAge: the run
 * is computed fresh on every request that gets through, and single-flight only
 * coalesces work that is still in flight. Nothing is cached.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = serverEnv();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Send a JSON body with a ticker and an amount.");
  }

  const parsed = previewBodySchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] = issue.message;
    return apiError("INVALID_INPUT", "Check the company and amount.", fields);
  }

  const amountCheck = checkAmount(parsed.data.amount, {
    min: env.WEB_MIN_AMOUNT_USDT,
    max: env.WEB_MAX_AMOUNT_USDT,
  });
  if (!amountCheck.ok) {
    return apiError("INVALID_INPUT", amountCheck.message ?? "That amount is not valid.", {
      amount: amountCheck.message ?? "invalid",
    });
  }

  const ip = clientIpOf(request.headers);
  const limit = previewRateLimiter().check(ip);
  if (!limit.allowed) {
    return apiError(
      "RATE_LIMITED",
      `Too many previews from this address. Try again in ${limit.retryAfterSeconds}s.`,
    );
  }

  const key = `${parsed.data.ticker}:${parsed.data.amount}`;
  try {
    const dto = await previewFlight().run(key, () =>
      previewBudget().run(() =>
        runPreview({ pool: db(), ticker: parsed.data.ticker, amount: parsed.data.amount }),
      ),
    );
    return apiOk(dto, { "X-RateLimit-Remaining": String(limit.remaining) });
  } catch (err) {
    if (err instanceof BudgetExhaustedError) {
      return apiError(
        "BUSY",
        "Orchard is at its pricing limit right now. Nothing was submitted - try again in a moment.",
      );
    }
    if (err instanceof UnknownTickerError) {
      return apiError("NOT_FOUND", `Orchard does not support ${parsed.data.ticker} today.`);
    }
    if (err instanceof ProviderUnavailableError) {
      return apiError(
        "PROVIDER_UNAVAILABLE",
        "The pricing provider could not be reached. No transaction was submitted.",
      );
    }
    return apiError("INTERNAL", "That preview could not be completed. Nothing was submitted.");
  }
}
