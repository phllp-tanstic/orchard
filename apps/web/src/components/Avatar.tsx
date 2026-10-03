/**
 * Initials avatar (F003 T4). Rendered as text in a styled circle - no image
 * request of any kind, so there is no third-party image host to forbid.
 */
export function Avatar({ name, ticker }: { name: string; ticker: string }) {
  const source = name.trim() !== "" ? name : ticker;
  const parts = source.split(/[\s.-]+/).filter((part) => part.length > 0);
  // One word gives its first TWO characters rather than a lone letter: a
  // single-letter circle reads as a rendering fault next to the two-letter
  // ones beside it.
  const initials =
    parts.length === 1
      ? (parts[0] ?? "").slice(0, 2).toUpperCase()
      : parts
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join("");
  return (
    <span className="avatar" aria-hidden="true">
      {initials === "" ? ticker.slice(0, 2).toUpperCase() : initials}
    </span>
  );
}
