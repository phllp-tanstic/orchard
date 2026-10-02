"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TICKER_PATTERN } from "@/server/validation";

/**
 * Search (F003 T4). Submitting an exact-looking ticker goes straight to that
 * company; anything else goes to the explore list. Validation here is only a
 * convenience - the server validates again and is the authority.
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
        if (TICKER_PATTERN.test(query) && !query.includes(" ")) {
          router.push(`/stock/${encodeURIComponent(query.toUpperCase())}`);
        } else {
          router.push(`/explore?q=${encodeURIComponent(query)}`);
        }
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
