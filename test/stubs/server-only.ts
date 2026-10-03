/**
 * Test-only stand-in for the `server-only` marker package.
 *
 * `server-only` resolves to an empty module under React's `react-server`
 * condition and to a module that THROWS under every other condition. That is
 * exactly what makes it useful in the app - it is how a server module gets
 * caught the moment a client component imports it - and exactly why a plain
 * node test runner cannot import `apps/web/src/server/*` without this.
 *
 * Aliasing it here weakens nothing in the shipped app: the guarantee is
 * enforced by `next build` resolving the real package under its own condition,
 * and separately by the client-bundle secret scan, which asserts that no
 * server-side secret name or value reaches `.next/static`.
 */
export {};
