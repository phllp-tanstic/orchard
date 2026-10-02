import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Search and amount entry (F003 T5), plus the accessibility basics the spec
 * asks for: a label for every control, an announced error, and a touch target
 * the page does not scroll sideways to reach.
 *
 * `next/navigation` is mocked so a navigation is observable as a call rather
 * than requiring an app router in jsdom. That is the only seam.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const { SearchBox } = await import("./SearchBox");
const { AmountForm } = await import("./AmountForm");

afterEach(() => {
  cleanup();
  push.mockReset();
});

function submit(form: HTMLElement): void {
  act(() => {
    fireEvent.submit(form);
  });
}

describe("SearchBox", () => {
  it.each([
    ["a ticker", " nvda ", "/explore?q=nvda"],
    ["a single-word name", "nvidia", "/explore?q=nvidia"],
    ["free text", "Berkshire Hathaway", "/explore?q=Berkshire%20Hathaway"],
  ])("sends %s to the server to resolve", (_label, typed, expected) => {
    // The browser has no company list, so it must not decide whether a word is
    // a ticker. Guessing from the word's SHAPE is what sent "nvidia" to
    // /stock/NVIDIA and answered "not supported" for a supported company.
    const { container } = render(<SearchBox />);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: typed } });
    submit(container.querySelector("form") as HTMLElement);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it("never navigates straight to a stock page", () => {
    const { container } = render(<SearchBox />);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "NVDA" } });
    submit(container.querySelector("form") as HTMLElement);
    expect(push.mock.calls[0]?.[0]).not.toMatch(/^\/stock\//);
  });

  it("does nothing at all on an empty submit", () => {
    const { container } = render(<SearchBox />);
    submit(container.querySelector("form") as HTMLElement);
    expect(push).not.toHaveBeenCalled();
  });

  it("URL-encodes a query rather than letting it shape the path", () => {
    const { container } = render(<SearchBox />);
    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "nvda/../../etc" },
    });
    submit(container.querySelector("form") as HTMLElement);
    const target = push.mock.calls[0]?.[0] as string;
    expect(target).not.toContain("../");
  });

  it("is a labelled search landmark, not a bare input", () => {
    const { container } = render(<SearchBox />);
    expect(container.querySelector("form")?.getAttribute("role")).toBe("search");
    const input = screen.getByTestId("search-input");
    expect(input.getAttribute("id")).toBe("q");
    expect(container.querySelector('label[for="q"]')?.textContent).toBe("Company or ticker");
    expect(input.getAttribute("autocomplete")).toBe("off");
  });

  it("keeps a query the server already resolved, so the box is not cleared", () => {
    render(<SearchBox initial="Nvidia" />);
    expect((screen.getByTestId("search-input") as HTMLInputElement).value).toBe("Nvidia");
  });
});

describe("AmountForm", () => {
  function form() {
    return render(<AmountForm ticker="NVDA" min="5" max="1000" />);
  }

  it("states the bounds AND that they are a product default", () => {
    // Presenting a product choice as a provider limit would be a small lie
    // that a reader cannot check.
    form();
    const help = screen.getByText(/Between 5 and 1000 USDT/);
    expect(help.textContent).toContain("product default");
    expect(help.textContent).toContain("not a provider limit");
  });

  it("says plainly that no order is placed", () => {
    form();
    expect(screen.getByText(/does not place an order/)).toBeTruthy();
  });

  it("starts with the submit disabled and no error shouting at the visitor", () => {
    form();
    expect((screen.getByTestId("to-preview") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("amount-error")).toBeNull();
  });

  it("navigates with the amount as an exact string", () => {
    const { container } = form();
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "100.50" } });
    submit(container.querySelector("form") as HTMLElement);
    expect(push).toHaveBeenCalledWith("/stock/NVDA/preview?amount=100.50");
  });

  it("refuses an out-of-bounds amount and NEVER navigates", () => {
    const { container } = form();
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "1" } });
    fireEvent.blur(screen.getByTestId("amount-input"));
    submit(container.querySelector("form") as HTMLElement);
    expect(push).not.toHaveBeenCalled();
    const error = screen.getByTestId("amount-error");
    expect(error.textContent).toContain("minimum amount is 5");
    expect(error.getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("amount-input").getAttribute("aria-invalid")).toBe("true");
  });

  it.each([
    ["words", "one hundred"],
    ["a currency symbol", "$100"],
    ["a thousands separator", "1,000"],
    ["a negative", "-100"],
    ["above the max", "100000"],
  ])("refuses %s", (_label, value) => {
    const { container } = form();
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value } });
    submit(container.querySelector("form") as HTMLElement);
    expect(push).not.toHaveBeenCalled();
  });

  it("stays quiet until the field has been touched", () => {
    // An error before the visitor has typed anything is noise, not help.
    form();
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "1" } });
    expect(screen.queryByTestId("amount-error")).toBeNull();
    fireEvent.blur(screen.getByTestId("amount-input"));
    expect(screen.getByTestId("amount-error")).toBeTruthy();
  });

  it("clears the error once the amount becomes valid", () => {
    form();
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "1" } });
    fireEvent.blur(screen.getByTestId("amount-input"));
    expect(screen.getByTestId("amount-error")).toBeTruthy();
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "100" } });
    expect(screen.queryByTestId("amount-error")).toBeNull();
    expect((screen.getByTestId("to-preview") as HTMLButtonElement).disabled).toBe(false);
  });

  it("is labelled, described and set up for a numeric keyboard on mobile", () => {
    const { container } = form();
    const input = screen.getByTestId("amount-input");
    expect(container.querySelector('label[for="amount"]')?.textContent).toBe("Amount in USDT");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("aria-describedby")).toBe("amount-help");
    // A `type="number"` field silently drops what it cannot parse and varies
    // by locale, which is not acceptable for money.
    expect(input.getAttribute("type")).toBe("text");
  });

  it("asks for an amount in plain money terms, with no trading jargon", () => {
    const { container } = form();
    const text = container.textContent ?? "";
    for (const jargon of ["slippage", "wrapper", "contract", "gas", "token", "swap"]) {
      expect(text.toLowerCase()).not.toContain(jargon);
    }
  });
});
