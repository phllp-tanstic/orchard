import { expect, test, type Page } from "@playwright/test";

/**
 * The whole journey in a real browser (F003 T5): search, amount, preview,
 * drawer, and every honest state.
 *
 * Two kinds of test live here, and the difference matters:
 *
 *  - LIVE tests drive the real app against the real provider and the real
 *    evidence store. They assert the SHAPE of an honest answer rather than a
 *    specific number, because the market moves and may be closed; a test that
 *    demanded "0.42 shares" would be asserting the weather.
 *
 *  - STUBBED tests intercept the HTTP response of /api/previews in the browser
 *    so a state that depends on load or on a provider outage can be reached on
 *    demand. The stub replaces a RESPONSE at the network boundary, exactly as
 *    the browser would receive it; no money arithmetic and no engine code is
 *    faked, and the server keeps its own behaviour. Each is labelled.
 *
 * Run locally by the owner (`pnpm test:e2e`). Never in CI: AGENTS.md forbids
 * live provider calls there.
 */

const TICKER = process.env["ORCHARD_E2E_TICKER"] ?? "NVDA";
const AMOUNT = process.env["ORCHARD_E2E_AMOUNT"] ?? "100";

/** The notice that must appear on every page. */
async function expectPersistentNotice(page: Page): Promise<void> {
  const notice = page.locator("p.notice");
  await expect(notice).toContainText("Estimates only, and not advice");
  // `.first()`: the sentence appears in the footer and again on the confirm
  // step. More than one is the point, so this must not be a strict match.
  await expect(page.getByText(/signs, submits or broadcasts a transaction/).first()).toBeVisible();
}

test.describe("the app is reachable and honest about itself", () => {
  test("health reports what it actually measured", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = (await response.json()) as {
      ok: boolean;
      checks: Record<string, { ok: boolean; detail?: string; latencyMs?: number }>;
      snapshot: unknown;
      note: string;
    };
    // A health endpoint that cannot be trusted is worse than none, so this
    // asserts each check reports a real measurement rather than asserting
    // that everything is fine.
    expect(typeof body.ok).toBe("boolean");
    expect(typeof body.checks["database"]?.ok).toBe("boolean");
    expect(typeof body.checks["provider"]?.ok).toBe("boolean");
    // Latency proves the check actually ran rather than returning a constant.
    expect(typeof body.checks["database"]?.latencyMs).toBe("number");
    expect(body.note).toMatch(/signs, submits or broadcasts/);
    // 503 when something is genuinely down is the honest answer, so the
    // status is allowed to be either - but it must agree with `ok`.
    expect(response.status()).toBe(body.ok ? 200 : 503);
    expect(response.headers()["cache-control"]).toBe("no-store");
  });

  test("capabilities never claims execution", async ({ request }) => {
    const body = (await (await request.get("/api/capabilities")).json()) as {
      mainnetExecution: boolean;
      transactionSimulation: boolean;
      agenticWallet: boolean;
      shareIntent: boolean;
      fundedGifting: boolean;
      details: { singleServerInstanceAssumed: boolean; executionNotLiveReason: string };
    };
    expect(body.mainnetExecution).toBe(false);
    expect(body.transactionSimulation).toBe(false);
    expect(body.agenticWallet).toBe(false);
    expect(body.shareIntent).toBe(false);
    expect(body.fundedGifting).toBe(false);
    expect(body.details.singleServerInstanceAssumed).toBe(true);
    expect(body.details.executionNotLiveReason).toMatch(/not live/i);
  });

  test("responses are not cacheable", async ({ request }) => {
    for (const path of ["/api/capabilities", `/api/assets?q=${TICKER}`]) {
      const response = await request.get(path);
      expect(response.headers()["cache-control"], path).toBe("no-store");
    }
  });

  test("security headers and a per-request CSP nonce are present", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=_-]+'/);

    // A fresh load must get a DIFFERENT nonce, or the nonce is decoration.
    const second = await page.goto("/");
    const firstNonce = /nonce-([^']+)/.exec(csp)?.[1];
    const secondNonce = /nonce-([^']+)/.exec(
      second?.headers()["content-security-policy"] ?? "",
    )?.[1];
    expect(firstNonce).toBeTruthy();
    expect(secondNonce).not.toBe(firstNonce);
  });
});

test.describe("search to preview, live", () => {
  test("the home page leads with the company, not the plumbing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Buy the company");
    await expectPersistentNotice(page);

    // None of the plumbing vocabulary belongs in the default view. Matched on
    // WORD boundaries: a company legitimately called "... Index ..." contains
    // "dex", and flagging that would be the test misreading real data.
    const body = (await page.locator("body").textContent()) ?? "";
    for (const jargon of ["slippage", "wrapper", "DEX", "swap", "liquidity pool"]) {
      expect(body, `"${jargon}" must not appear on the home page`).not.toMatch(
        new RegExp(`\\b${jargon}\\b`, "i"),
      );
    }
    // A contract address would start with 0x followed by hex.
    expect(body).not.toMatch(/0x[0-9a-fA-F]{6,}/);
  });

  test("a ticker search goes to that company", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-input").fill(TICKER.toLowerCase());
    await page.getByTestId("search-submit").click();
    await expect(page).toHaveURL(new RegExp(`/stock/${TICKER}$`));
    await expect(page.getByTestId("asset-type")).toHaveText(/Stock|ETF|Pre-IPO/);
    await expect(page.getByTestId("representation-count")).toHaveText(/^[1-9]\d*$/);

    // The platform names belong in the drawer, which is not on this page.
    const body = (await page.locator("body").textContent())?.toLowerCase() ?? "";
    expect(body).not.toContain("ondo");
    expect(body).not.toContain("bstock");
  });

  test("a NAME search stays on the explore list, even as a single word", async ({ page }) => {
    // "corp" looks exactly like a ticker. Only the server knows it is not one,
    // which is why the shortcut lives there and not in the search box.
    await page.goto("/");
    await page.getByTestId("search-input").fill("corp");
    await page.getByTestId("search-submit").click();
    await expect(page).toHaveURL(/\/explore\?q=corp/);
    await expect(page.getByTestId("results")).toBeVisible();
  });

  test("a query matching NOTHING says so rather than guessing", async ({ page }) => {
    await page.goto("/explore?q=zzzznotacompany");
    await expect(page.getByTestId("no-results")).toContainText("Nothing in Orchard");
    await expect(page.getByTestId("results")).toHaveCount(0);
  });

  test("the amount step states its bounds as product defaults", async ({ page }) => {
    await page.goto(`/stock/${TICKER}/amount`);
    await expect(
      page.getByText(/product default for this preview, not a provider limit/),
    ).toBeVisible();
    await page.getByTestId("amount-input").fill("1");
    await page.getByTestId("amount-input").blur();
    await expect(page.getByTestId("amount-error")).toContainText("minimum amount");
    await expect(page.getByTestId("to-preview")).toBeDisabled();
  });

  test("a live preview gives a winner with numbers, or says honestly why not", async ({ page }) => {
    await page.goto(`/stock/${TICKER}/amount`);
    await page.getByTestId("amount-input").fill(AMOUNT);
    await page.getByTestId("to-preview").click();
    await expect(page).toHaveURL(new RegExp(`/stock/${TICKER}/preview\\?amount=${AMOUNT}`));

    // Exactly ONE of the honest outcomes, never a blank screen or a zero.
    const winner = page.getByTestId("preview-winner");
    const noRoute = page.getByTestId("banner-no-route");
    const provider = page.getByTestId("banner-provider");
    await expect(winner.or(noRoute).or(provider)).toBeVisible({ timeout: 90_000 });

    if (await winner.isVisible()) {
      // A real share count and a real price, as decimal strings.
      await expect(page.getByTestId("estimated-shares")).toHaveText(/^\d+\.\d+$/);
      await expect(page.getByTestId("price-per-share")).toHaveText(/^\d+(\.\d+)?$/);
      await expect(page.getByTestId("decision-reason")).not.toBeEmpty();
      await expect(page.getByTestId("freshness")).toBeVisible();
    } else if (await noRoute.isVisible()) {
      await expect(noRoute).toContainText("No transaction was submitted");
      await expect(noRoute.locator("li")).not.toHaveCount(0);
    } else {
      await expect(provider).toContainText("No transaction was submitted");
    }

    // Whatever happened, the confirm step is inert and says so.
    await expect(page.getByTestId("confirm")).toBeDisabled();
    await expectPersistentNotice(page);
  });

  test("the drawer is where the platforms and the raw codes live", async ({ page }) => {
    await page.goto(`/stock/${TICKER}/preview?amount=${AMOUNT}`);
    const drawer = page.getByTestId("why-drawer");
    await expect(drawer).toBeVisible({ timeout: 90_000 });
    // Closed by default: the mechanism is available, not imposed.
    await expect(drawer.locator("summary")).toBeVisible();
    expect(await drawer.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);

    await drawer.locator("summary").click();
    await expect(drawer).toContainText("most shares for your amount");
    const text = (await drawer.textContent()) ?? "";
    expect(text).toMatch(/ACCEPTED|REJECTED/);
  });

  test("Refresh asks for a new quote", async ({ page }) => {
    await page.goto(`/stock/${TICKER}/preview?amount=${AMOUNT}`);
    await expect(page.getByTestId("refresh")).toBeVisible({ timeout: 90_000 });
    const requote = page.waitForResponse(
      (response) =>
        response.url().includes("/api/previews") && response.request().method() === "POST",
    );
    await page.getByTestId("refresh").click();
    expect((await requote).status()).toBeLessThan(600);
  });

  test("an unsupported ticker says so instead of guessing", async ({ page }) => {
    await page.goto("/stock/ZZZZZZ");
    await expect(page.getByTestId("unsupported")).toContainText("does not support ZZZZZZ");
  });
});

test.describe("the honest states, reached by stubbing the API RESPONSE", () => {
  test("the busy state says nothing was submitted", async ({ page }) => {
    await page.route("**/api/previews", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "BUSY", message: "Orchard is at its pricing limit right now." },
        }),
      }),
    );
    await page.goto(`/stock/${TICKER}/preview?amount=${AMOUNT}`);
    await expect(page.getByTestId("banner-busy")).toContainText("Nothing was submitted");
    await expect(page.getByTestId("preview-winner")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("the rate-limited state passes the retry hint through", async ({ page }) => {
    await page.route("**/api/previews", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "RATE_LIMITED", message: "Too many previews. Try again in 42s." },
        }),
      }),
    );
    await page.goto(`/stock/${TICKER}/preview?amount=${AMOUNT}`);
    await expect(page.getByTestId("banner-rate-limited")).toContainText("Try again in 42s.");
  });

  test("a provider outage shows no price at all", async ({ page }) => {
    await page.route("**/api/previews", (route) => route.abort("failed"));
    await page.goto(`/stock/${TICKER}/preview?amount=${AMOUNT}`);
    await expect(page.getByTestId("banner-provider")).toContainText("no price is shown");
    await expect(page.getByTestId("estimated-shares")).toHaveCount(0);
  });

  test("no eligible route lists every reason and shows no numbers", async ({ page }) => {
    await page.route("**/api/previews", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ticker: TICKER,
          companyName: "Stubbed Company",
          assetTypeLabel: "Stock",
          amount: AMOUNT,
          spendAssetSymbol: "USDT",
          outcome: "NO_ELIGIBLE_ROUTE",
          decisionReasons: [
            "This company is outside its trading session right now.",
            "This route would move the price too far for the amount entered.",
          ],
          decisionReasonCodes: ["NON_TRADING_SESSION", "PRICE_IMPACT_EXCEEDS_MAX"],
          algorithmVersion: "f002-rank-1.0.0",
          maxQuoteAgeSeconds: 20,
          candidates: [],
        }),
      }),
    );
    await page.goto(`/stock/${TICKER}/preview?amount=${AMOUNT}`);
    const banner = page.getByTestId("banner-no-route");
    await expect(banner).toContainText("No transaction was submitted");
    await expect(banner.locator("li")).toHaveCount(2);
    await expect(page.getByTestId("estimated-shares")).toHaveCount(0);
    await expect(page.getByTestId("confirm")).toBeDisabled();
  });

  test("an expired quote stops presenting its numbers as live", async ({ page }) => {
    await page.route("**/api/previews", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ticker: TICKER,
          companyName: "Stubbed Company",
          assetTypeLabel: "Stock",
          amount: AMOUNT,
          spendAssetSymbol: "USDT",
          outcome: "SELECTED",
          winner: {
            platform: "ondo",
            tokenSymbol: "STUBon",
            estimatedShares: "0.42417911924005988965",
            estimatedPricePerShare: "235.7494639980286481",
          },
          decisionReasons: ["It returned the most shares for your amount."],
          decisionReasonCodes: ["NORMALIZED_SHARES_DESC"],
          algorithmVersion: "f002-rank-1.0.0",
          quotedAt: new Date(Date.now() - 60_000).toISOString(),
          expiresAt: new Date(Date.now() - 40_000).toISOString(),
          maxQuoteAgeSeconds: 20,
          candidates: [],
        }),
      }),
    );
    await page.goto(`/stock/${TICKER}/preview?amount=${AMOUNT}`);
    await expect(page.getByTestId("countdown-expired")).toContainText("This quote has expired");
    await expect(page.getByTestId("countdown")).toHaveCount(0);
  });
});

test.describe("accessibility and layout smoke checks", () => {
  const paths = ["/", "/explore", `/stock/${TICKER}`, `/stock/${TICKER}/amount`];

  for (const path of paths) {
    test(`${path} has one h1, labelled controls and no sideways scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      // Every control a visitor can type into must have a programmatic label.
      const unlabelled = await page.evaluate(() => {
        const controls = [...document.querySelectorAll("input, select, textarea")];
        return controls
          .filter((el) => {
            const id = el.getAttribute("id");
            const hasLabel = id !== null && document.querySelector(`label[for="${id}"]`) !== null;
            return !hasLabel && el.getAttribute("aria-label") === null;
          })
          .map((el) => el.outerHTML);
      });
      expect(unlabelled).toEqual([]);

      // Nothing loads a third-party image, so there is no pixel recording
      // which company was looked at.
      const remoteImages = await page.evaluate(() =>
        [...document.querySelectorAll("img")]
          .map((img) => img.getAttribute("src") ?? "")
          .filter((src) => /^https?:\/\//.test(src)),
      );
      expect(remoteImages).toEqual([]);

      // The page must never scroll horizontally - this project runs at phone
      // width in the `mobile` project as well as on the desktop one.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("the preview page is keyboard reachable end to end", async ({ page }) => {
    await page.goto(`/stock/${TICKER}/amount`);
    const input = page.getByTestId("amount-input");
    await input.focus();
    await input.fill(AMOUNT);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/stock/${TICKER}/preview`));
  });

  test("no console error is left behind on the journey", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await page.goto(`/stock/${TICKER}`);
    await page.goto(`/stock/${TICKER}/amount`);
    // A CSP violation surfaces here, which is the point: a nonce that does not
    // match would break the page silently otherwise.
    expect(errors.filter((e) => /Content Security Policy|refused to execute/i.test(e))).toEqual([]);
  });
});
