import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { PreviewDto } from "@/server/dto";
import type { Capabilities } from "@/server/api";
import { PreviewPanel } from "./PreviewPanel";

/**
 * The preview screen's honest states (F003 T5).
 *
 * `fetch` is stubbed so each API outcome - 200, BUSY, PROVIDER_UNAVAILABLE,
 * RATE_LIMITED, an unexpected code, a network failure - renders exactly one
 * state and no numbers it did not receive. Nothing here mocks money
 * arithmetic: the component does none.
 */

const CAPS: Capabilities = {
  rwaDiscovery: true,
  liveQuotes: true,
  bestExecution: true,
  transactionSimulation: false,
  mainnetExecution: false,
  agenticWallet: false,
  shareIntent: false,
  fundedGifting: false,
  details: {
    algorithmVersion: "f002-rank-1.0.0",
    spendAssetSymbol: "USDT",
    minAmount: "5",
    maxAmount: "1000",
    amountBoundsAreProductDefaults: true,
    maxQuoteAgeSeconds: 20,
    maxPriceImpactBps: "300",
    maxReferenceDeviationBps: "500",
    allowedAssetTypes: [1, 3],
    snapshotMaxAgeSeconds: 21600,
    singleServerInstanceAssumed: true,
    executionNotLiveReason:
      "Execution is not live yet. Nothing in this app signs, submits or broadcasts a transaction.",
  },
};

function dto(overrides: Partial<PreviewDto> = {}): PreviewDto {
  return {
    ticker: "NVDA",
    companyName: "NVIDIA Corporation",
    assetTypeLabel: "Stock",
    amount: "100",
    spendAssetSymbol: "USDT",
    outcome: "SELECTED",
    winner: {
      platform: "ondo",
      tokenSymbol: "NVDAon",
      estimatedShares: "0.42417911924005988965",
      estimatedPricePerShare: "235.7494639980286481",
      tradeFee: "0.01931007",
      networkFee: "450000",
    },
    decisionReasons: ["It returned the most shares for your amount."],
    decisionReasonCodes: ["NORMALIZED_SHARES_DESC"],
    algorithmVersion: "f002-rank-1.0.0",
    maxQuoteAgeSeconds: 20,
    candidates: [],
    ...overrides,
  };
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A fresh Response per call. Reusing one object makes the SECOND call fail with
 * "Body has already been read", which would hide a real retry bug behind a
 * misleading error.
 */
function stubFetch(responder: (body: unknown) => Response): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (_url: unknown, init?: RequestInit) =>
    responder(init?.body === undefined ? undefined : JSON.parse(String(init.body))),
  );
  vi.stubGlobal("fetch", spy);
  return spy as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function panel(props: { initial?: PreviewDto | undefined } = {}) {
  return render(<PreviewPanel ticker="NVDA" amount="100" capabilities={CAPS} {...props} />);
}

describe("PreviewPanel - loading", () => {
  it("says it is asking the provider rather than showing a placeholder number", async () => {
    let settle: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            settle = resolve;
          }),
      ),
    );
    panel();
    const loading = await screen.findByTestId("preview-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toContain("Asking the provider for live quotes");
    // No zeros, no dashes, no skeleton numbers.
    expect(loading.textContent).not.toMatch(/\d+\.\d+/);

    await act(async () => {
      settle(okResponse(dto()));
    });
  });

  it("does NOT refetch when the server already rendered a preview", async () => {
    const spy = stubFetch(() => okResponse(dto()));
    panel({ initial: dto() });
    await screen.findByTestId("preview-winner");
    expect(spy).not.toHaveBeenCalled();
  });

  it("asks for exactly the ticker and amount it was given", async () => {
    const spy = stubFetch(() => okResponse(dto()));
    panel();
    await screen.findByTestId("preview-winner");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(spy.mock.calls[0]?.[0]).toBe("/api/previews");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ticker: "NVDA", amount: "100" });
  });
});

describe("PreviewPanel - a selected route", () => {
  it("renders the server's EXACT decimal strings", async () => {
    // Any formatting here would make the screen disagree with the evidence
    // store about what was quoted.
    panel({ initial: dto() });
    expect((await screen.findByTestId("estimated-shares")).textContent).toBe(
      "0.42417911924005988965",
    );
    expect(screen.getByTestId("price-per-share").textContent).toBe("235.7494639980286481");
  });

  it("names the company and its asset type, not the platform", async () => {
    // The platform belongs in the drawer only (F003 T4).
    panel({ initial: dto() });
    const winner = await screen.findByTestId("preview-winner");
    expect(winner.textContent).toContain("NVIDIA Corporation");
    expect(winner.textContent).toContain("Stock");
    expect(winner.textContent).not.toContain("ondo");
  });

  it("explains in plain language why this route won", async () => {
    panel({ initial: dto() });
    expect((await screen.findByTestId("decision-reason")).textContent).toContain(
      "most shares for your amount",
    );
  });

  it("omits a fee row entirely when the provider disclosed none", async () => {
    panel({
      initial: dto({
        winner: {
          platform: "ondo",
          tokenSymbol: "NVDAon",
          estimatedShares: "0.4",
          estimatedPricePerShare: "250",
        },
      }),
    });
    const winner = await screen.findByTestId("preview-winner");
    expect(winner.textContent).not.toContain("Disclosed trade fee");
    expect(winner.textContent).not.toContain("Network fee estimate");
  });

  it("shows the execution_request id so the screen can be reconciled", async () => {
    panel({ initial: dto({ executionRequestId: "req-42" }) });
    expect((await screen.findByTestId("execution-request-id")).textContent).toContain("req-42");
  });

  it("always offers the disabled confirm step with the server's reason", async () => {
    panel({ initial: dto() });
    const confirm = (await screen.findByTestId("confirm")) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId("confirm-reason").textContent).toContain("not live yet");
  });
});

describe("PreviewPanel - no eligible route", () => {
  it("shows no numbers at all, only the reasons", async () => {
    panel({
      initial: dto({
        outcome: "NO_ELIGIBLE_ROUTE",
        winner: undefined,
        decisionReasons: ["This company is outside its trading session right now."],
        decisionReasonCodes: ["NON_TRADING_SESSION"],
      }),
    });
    const banner = await screen.findByTestId("banner-no-route");
    expect(banner.textContent).toContain("No transaction was submitted");
    expect(banner.textContent).toContain("outside its trading session");
    expect(screen.queryByTestId("preview-winner")).toBeNull();
    expect(screen.queryByTestId("estimated-shares")).toBeNull();
  });

  it("still offers the drawer, so the rejections are inspectable", async () => {
    panel({
      initial: dto({
        outcome: "NO_ELIGIBLE_ROUTE",
        winner: undefined,
        candidates: [
          {
            platform: "ondo",
            tokenSymbol: "NVDAon",
            assetTypeLabel: "Stock",
            accepted: false,
            referenceUnavailable: false,
            reasons: ["This company is outside its trading session right now."],
            reasonCodes: ["NON_TRADING_SESSION"],
            providerCodes: ["40367"],
          },
        ],
      }),
    });
    expect((await screen.findByTestId("candidate-ondo")).textContent).toContain(
      "NON_TRADING_SESSION",
    );
  });
});

describe("PreviewPanel - freshness", () => {
  it("counts down while the quote is valid", async () => {
    const expiresAt = new Date(Date.now() + 15_000).toISOString();
    panel({ initial: dto({ quotedAt: new Date().toISOString(), expiresAt }) });
    const countdown = await screen.findByTestId("countdown");
    expect(countdown.textContent).toMatch(/Quote valid for 1[0-9]s/);
    expect(screen.queryByTestId("countdown-expired")).toBeNull();
  });

  it("says EXPIRED rather than continuing to present the numbers as live", async () => {
    const expiresAt = new Date(Date.now() - 1_000).toISOString();
    panel({ initial: dto({ expiresAt }) });
    const expired = await screen.findByTestId("countdown-expired");
    expect(expired.textContent).toContain("This quote has expired");
    expect(expired.textContent).toContain("Refresh");
  });

  it("ticks down on its own, reaching the expired state", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const expiresAt = new Date(Date.now() + 3_000).toISOString();
    panel({ initial: dto({ expiresAt }) });
    expect(screen.getByTestId("countdown").textContent).toContain("3s");
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByTestId("countdown-expired")).toBeTruthy();
  });

  it("says so plainly when no quote timestamp came back", async () => {
    // Silence here would let a reader assume the quote is current.
    panel({ initial: dto() });
    const freshness = await screen.findByTestId("freshness");
    expect(freshness.textContent).toContain("No quote timestamp was returned");
  });

  it("Refresh requotes and replaces the numbers", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        return okResponse(
          call === 1
            ? dto()
            : dto({
                winner: {
                  platform: "bstock",
                  tokenSymbol: "NVDAx",
                  estimatedShares: "0.39000000000000000000",
                  estimatedPricePerShare: "256.41",
                },
              }),
        );
      }),
    );
    panel();
    await screen.findByTestId("preview-winner");
    expect(screen.getByTestId("estimated-shares").textContent).toBe("0.42417911924005988965");

    const refresh = screen.getByTestId("refresh") as HTMLButtonElement;
    await act(async () => {
      refresh.click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("estimated-shares").textContent).toBe("0.39000000000000000000"),
    );
    expect(call).toBe(2);
  });
});

describe("PreviewPanel - failures are stated, never papered over", () => {
  it("renders the BUSY state with a retry and no price", async () => {
    stubFetch(() => errorResponse(503, "BUSY", "at the pricing limit"));
    panel();
    const banner = await screen.findByTestId("banner-busy");
    expect(banner.textContent).toContain("Nothing was submitted");
    expect(screen.queryByTestId("preview-winner")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("renders the PROVIDER_UNAVAILABLE state with no price at all", async () => {
    stubFetch(() => errorResponse(502, "PROVIDER_UNAVAILABLE", "unreachable"));
    panel();
    const banner = await screen.findByTestId("banner-provider");
    expect(banner.textContent).toContain("no price is shown");
    expect(screen.queryByTestId("estimated-shares")).toBeNull();
  });

  it("treats a NETWORK failure as provider-unavailable, not as a zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("NetworkError"))),
    );
    panel();
    expect((await screen.findByTestId("banner-provider")).textContent).toContain(
      "No transaction was submitted",
    );
  });

  it("passes the RATE_LIMITED message through verbatim", async () => {
    stubFetch(() => errorResponse(429, "RATE_LIMITED", "Too many previews. Try again in 42s."));
    panel();
    expect((await screen.findByTestId("banner-rate-limited")).textContent).toContain(
      "Try again in 42s.",
    );
  });

  it("shows an unexpected error's message without inventing a state for it", async () => {
    stubFetch(() => errorResponse(400, "INVALID_INPUT", "Check the company and amount."));
    panel();
    expect((await screen.findByTestId("banner-other")).textContent).toBe(
      "Check the company and amount.",
    );
  });

  it("falls back to a stated message when the error body is unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502</html>", { status: 502 })),
    );
    panel();
    expect((await screen.findByTestId("banner-other")).textContent).toContain(
      "could not be completed",
    );
  });

  it("CLEARS a previous preview when a refresh fails", async () => {
    // Leaving the old numbers on screen after a failed requote would present
    // an expired price as a current one.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        return call === 1 ? okResponse(dto()) : errorResponse(502, "PROVIDER_UNAVAILABLE", "gone");
      }),
    );
    panel();
    await screen.findByTestId("preview-winner");
    await act(async () => {
      (screen.getByTestId("refresh") as HTMLButtonElement).click();
    });
    await screen.findByTestId("banner-provider");
    expect(screen.queryByTestId("preview-winner")).toBeNull();
    expect(screen.queryByTestId("estimated-shares")).toBeNull();
  });

  it("recovers when a retry succeeds", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        return call === 1 ? errorResponse(503, "BUSY", "busy") : okResponse(dto());
      }),
    );
    panel();
    await screen.findByTestId("banner-busy");
    await act(async () => {
      (screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).click();
    });
    expect((await screen.findByTestId("estimated-shares")).textContent).toBe(
      "0.42417911924005988965",
    );
  });
});
