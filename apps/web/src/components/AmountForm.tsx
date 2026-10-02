"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkAmount } from "@/server/validation";

/**
 * Amount entry (F003 T4). Banking language: an amount in USDT, nothing about
 * slippage, wrappers or contracts.
 *
 * Validation here mirrors the server's so the hint is instant, but the server
 * validates again and is the authority - this component cannot be trusted and
 * is not relied on.
 *
 * `checkAmount` uses decimal.js, so even the client-side hint avoids float
 * comparison on money.
 */
export function AmountForm({ ticker, min, max }: { ticker: string; min: string; max: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const check = checkAmount(amount, { min, max });
  const showError = touched && amount !== "" && !check.ok;

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!check.ok) return;
        router.push(`/stock/${ticker}/preview?amount=${encodeURIComponent(amount.trim())}`);
      }}
    >
      <label htmlFor="amount">Amount in USDT</label>
      <input
        id="amount"
        name="amount"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="100"
        value={amount}
        aria-describedby="amount-help"
        aria-invalid={showError ? "true" : "false"}
        onChange={(event) => setAmount(event.target.value)}
        onBlur={() => setTouched(true)}
        data-testid="amount-input"
      />
      <p className="tiny muted" id="amount-help" style={{ marginTop: 6 }}>
        Between {min} and {max} USDT. These bounds are a product default for this preview, not a
        provider limit.
      </p>
      {showError ? (
        <p className="tiny" role="alert" style={{ color: "#7d2020" }} data-testid="amount-error">
          {check.message}
        </p>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <button type="submit" disabled={amount === "" || !check.ok} data-testid="to-preview">
          See the preview
        </button>
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>
        This shows an estimate from live quotes. It does not place an order.
      </p>
    </form>
  );
}
