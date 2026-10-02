import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CandidateDto } from "@/server/dto";
import {
  BusyBanner,
  MarketClosedBanner,
  NoRouteBanner,
  ProviderUnavailableBanner,
  RateLimitedBanner,
  StaleUniverseBanner,
} from "./Banners";
import { ConfirmButton } from "./ConfirmButton";
import { Avatar } from "./Avatar";
import { WhyDrawer } from "./WhyDrawer";

/**
 * The honest states (F003 T5). Each banner has to say what happened, and every
 * money-adjacent one has to say explicitly that nothing was submitted - that
 * sentence is the whole point of the state, so it is asserted, not assumed.
 *
 * `globals: false`, so cleanup is explicit rather than implicit.
 */
afterEach(cleanup);

describe("StaleUniverseBanner", () => {
  it("says the LIST is stale while making clear prices are still live", () => {
    // Conflating the two would be the dangerous error: a stale company list
    // does not mean a stale price.
    render(<StaleUniverseBanner ageSeconds={25_200} maxAgeSeconds={21_600} />);
    const banner = screen.getByTestId("banner-stale");
    expect(banner.textContent).toContain("company list may be out of date");
    expect(banner.textContent).toContain("420 minutes ago");
    expect(banner.textContent).toContain("360 minutes");
    expect(banner.textContent).toContain("quoted live at the moment you ask");
  });

  it("says plainly when NO snapshot exists, rather than showing an age of zero", () => {
    render(<StaleUniverseBanner ageSeconds={null} maxAgeSeconds={21_600} />);
    expect(screen.getByTestId("banner-stale").textContent).toContain(
      "No completed universe snapshot exists yet",
    );
  });

  it("is announced to assistive technology", () => {
    render(<StaleUniverseBanner ageSeconds={60} maxAgeSeconds={21_600} />);
    expect(screen.getByTestId("banner-stale").getAttribute("role")).toBe("status");
  });
});

describe("MarketClosedBanner", () => {
  it("does not promise a failure, and does not hide the provider's answer", () => {
    render(<MarketClosedBanner />);
    const text = screen.getByTestId("banner-market-closed").textContent ?? "";
    expect(text).toContain("outside its trading session");
    expect(text).toContain("usually cannot be priced");
    expect(text).toContain("exactly what the provider said");
  });
});

describe("NoRouteBanner", () => {
  it("says no transaction was submitted and lists EVERY reason", () => {
    render(
      <NoRouteBanner
        reasons={[
          "This company is outside its trading session right now.",
          "This route would move the price too far for the amount entered.",
        ]}
      />,
    );
    const banner = screen.getByTestId("banner-no-route");
    expect(banner.textContent).toContain("No eligible route");
    expect(banner.textContent).toContain("No transaction was submitted");
    expect(banner.querySelectorAll("li")).toHaveLength(2);
    expect(banner.getAttribute("role")).toBe("alert");
  });

  it("renders without reasons rather than crashing the page", () => {
    render(<NoRouteBanner reasons={[]} />);
    expect(screen.getByTestId("banner-no-route").querySelectorAll("li")).toHaveLength(0);
  });
});

describe("BusyBanner", () => {
  it("says nothing was submitted and explains the limit honestly", () => {
    render(<BusyBanner />);
    const text = screen.getByTestId("banner-busy").textContent ?? "";
    expect(text).toContain("Nothing was submitted");
    expect(text).toContain("one server");
    expect(text).toMatch(/request limits/);
  });
});

describe("ProviderUnavailableBanner", () => {
  it("shows no price at all and says why that is the right answer", () => {
    render(<ProviderUnavailableBanner />);
    const text = screen.getByTestId("banner-provider").textContent ?? "";
    expect(text).toContain("No transaction was submitted");
    expect(text).toContain("no price is shown");
    expect(text).toContain("guessed price would be worse than none");
  });
});

describe("RateLimitedBanner", () => {
  it("passes the server's retry message through verbatim", () => {
    render(<RateLimitedBanner message="Try again in 42s." />);
    expect(screen.getByTestId("banner-rate-limited").textContent).toContain("Try again in 42s.");
  });
});

describe("ConfirmButton", () => {
  it("is disabled and says execution is not live, with the server's reason", () => {
    render(
      <ConfirmButton
        mainnetExecution={false}
        reason="Execution is not live yet. Nothing in this app signs, submits or broadcasts a transaction."
      />,
    );
    const button = screen.getByTestId("confirm") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toBe("Execution is not live yet");
    expect(screen.getByTestId("confirm-reason").textContent).toContain(
      "signs, submits or broadcasts",
    );
  });

  it("stays INERT even if the capability flag were true", () => {
    // This feature ships no execution path at all. A flag flip must not
    // produce a working buy button by accident.
    render(<ConfirmButton mainnetExecution={true} reason="ignored" />);
    const button = screen.getByTestId("confirm") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toContain("not available");
  });

  it("has no form, action or href that could submit anything", () => {
    const { container } = render(<ConfirmButton mainnetExecution={false} reason="x" />);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByTestId("confirm").getAttribute("type")).toBe("button");
  });
});

describe("Avatar", () => {
  it("renders initials as TEXT, never an image request", () => {
    // No image means no third-party host to allow in the CSP and no pixel
    // leaking which company a visitor looked at.
    const { container } = render(<Avatar name="NVIDIA Corporation" ticker="NVDA" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("NC");
  });

  it("falls back to the ticker when there is no name", () => {
    const { container } = render(<Avatar name="   " ticker="NVDA" />);
    expect(container.textContent).toBe("NV");
  });

  it("gives a single-word name two characters, not a lone letter", () => {
    const { container } = render(<Avatar name="Nvidia" ticker="NVDA" />);
    expect(container.textContent).toBe("NV");
  });

  it("renders something for a name with no usable characters", () => {
    const { container } = render(<Avatar name="..." ticker="brk.b" />);
    expect(container.textContent).toBe("BR");
  });

  it("splits on dots and dashes, as real tickers contain them", () => {
    const { container } = render(<Avatar name="" ticker="BRK.B" />);
    expect(container.textContent).toBe("BB");
  });

  it("is hidden from assistive technology, being decorative", () => {
    const { container } = render(<Avatar name="Apple Inc" ticker="AAPL" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

function candidateDto(overrides: Partial<CandidateDto> = {}): CandidateDto {
  return {
    platform: "ondo",
    tokenSymbol: "NVDAon",
    assetTypeLabel: "Stock",
    accepted: true,
    estimatedShares: "0.42417911924005988965",
    estimatedPricePerShare: "235.7494639980286481",
    referencePrice: "236.19",
    deviationBps: "-18.65",
    priceImpactBps: "106.99",
    tradeFee: "0.01931007",
    networkFee: "450000",
    quoteAgeSeconds: 2,
    referenceUnavailable: false,
    reasons: [],
    reasonCodes: [],
    providerCodes: [],
    ...overrides,
  };
}

describe("WhyDrawer", () => {
  it("is the only place the ranking and the platform names are explained", () => {
    render(<WhyDrawer candidates={[candidateDto()]} />);
    const drawer = screen.getByTestId("why-drawer");
    expect(drawer.tagName).toBe("DETAILS");
    expect(drawer.hasAttribute("open")).toBe(false);
    expect(drawer.textContent).toContain("most shares for your amount");
    expect(screen.getByTestId("candidate-ondo").textContent).toContain("ondo");
  });

  it("renders every number as the EXACT string the server sent", () => {
    // Any rounding here would be the browser disagreeing with the evidence
    // store about what was quoted.
    render(<WhyDrawer candidates={[candidateDto()]} />);
    const text = screen.getByTestId("candidate-ondo").textContent ?? "";
    expect(text).toContain("0.42417911924005988965");
    expect(text).toContain("235.7494639980286481");
    expect(text).toContain("-18.65 bps");
    expect(text).toContain("106.99 bps");
  });

  it("counts accepted and rejected routes correctly", () => {
    render(
      <WhyDrawer
        candidates={[
          candidateDto(),
          candidateDto({
            platform: "bstock",
            accepted: false,
            reasons: ["This company is outside its trading session right now."],
            reasonCodes: ["NON_TRADING_SESSION"],
            providerCodes: ["40367"],
          }),
        ]}
      />,
    );
    const summary = screen.getByTestId("why-drawer").textContent ?? "";
    expect(summary).toContain("1 route met every check");
    expect(summary).toContain("1 did not");
  });

  it("shows the plain-language reason AND the raw code for a rejection", () => {
    render(
      <WhyDrawer
        candidates={[
          candidateDto({
            accepted: false,
            reasons: ["This company is outside its trading session right now."],
            reasonCodes: ["NON_TRADING_SESSION"],
            providerCodes: ["40367"],
          }),
        ]}
      />,
    );
    const text = screen.getByTestId("candidate-ondo").textContent ?? "";
    expect(text).toContain("outside its trading session");
    expect(text).toContain("NON_TRADING_SESSION");
    expect(text).toContain("provider 40367");
    expect(text).toContain("REJECTED");
  });

  it("says a MISSING reference is not a zero deviation", () => {
    render(<WhyDrawer candidates={[candidateDto({ referenceUnavailable: true })]} />);
    const note = screen.getByTestId("reference-unavailable").textContent ?? "";
    expect(note).toContain("No reference price was available");
    expect(note).toContain("not the same as a zero deviation");
  });

  it("omits a metric entirely rather than printing a blank or a zero", () => {
    render(
      <WhyDrawer candidates={[candidateDto({ tradeFee: undefined, networkFee: undefined })]} />,
    );
    const text = screen.getByTestId("candidate-ondo").textContent ?? "";
    expect(text).not.toContain("Trade fee");
    expect(text).not.toContain("Network fee estimate");
  });

  it("renders with no candidates at all", () => {
    render(<WhyDrawer candidates={[]} />);
    expect(screen.getByTestId("why-drawer").textContent).toContain("0 routes met every check");
  });
});
