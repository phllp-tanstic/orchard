"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Search (F003 T4).
 *
 * Every query goes to the explore list, which decides - on the server, with
 * the snapshot in hand - whether it is an exact ticker and should jump
 * straight to that company.
 *
 * This component deliberately does NOT make that decision itself. It used to
 * treat any single ticker-shaped word as a ticker, which sent "nvidia"
 * straight to /stock/NVIDIA and answered "Orchard does not support NVIDIA" for
 * a company Orchard does support. The browser has no company list, so it
 * cannot tell a ticker from a name; only the server can.
 */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  return (
    <form
      className="row"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        if (query === "") return;
        router.push(`/explore?q=${encodeURIComponent(query)}`);
      }}
    >
      <div className="grow">
        <label htmlFor="q">Company or ticker</label>
        <input
          id="q"
          name="q"
          type="search"
          autoComplete="off"
          placeholder="NVDA, Nvidia, Apple…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          data-testid="search-input"
        />
      </div>
      <button type="submit" style={{ alignSelf: "flex-end" }} data-testid="search-submit">
        Search
      </button>
    </form>
  );
}
