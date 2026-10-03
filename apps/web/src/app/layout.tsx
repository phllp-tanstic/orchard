import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orchard - tokenized stocks on BNB Chain",
  description:
    "Search a company, enter an amount, and see which supported route Orchard's engine would use. Estimates only. Read-only: nothing is submitted.",
  robots: { index: false, follow: false },
};

/**
 * Root layout (F003 T4). The persistent plain notice lives here so it is on
 * EVERY page rather than only where someone remembered to add it.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="app">
          <div className="shell">
            <Link href="/">Orchard</Link>
            <span className="tagline">Buy the company. We choose the rail.</span>
          </div>
        </header>
        <main className="shell">
          {children}
          <footer className="app">
            <p className="notice" role="note">
              <strong>Estimates only, and not advice.</strong> Price and size are not guaranteed.
              Orchard compares supported eligible routes and shows what its engine found; it does
              not execute anything. Tokenized securities may be restricted in some jurisdictions and
              Orchard does not yet verify your eligibility.
            </p>
            <p className="tiny muted">
              Read-only preview. Nothing on this site signs, submits or broadcasts a transaction.
            </p>
          </footer>
        </main>
      </body>
    </html>
  );
}
