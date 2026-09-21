import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPreHash, sign } from "./signer.js";

/**
 * Vectors loaded from test/fixtures/SYNTHETIC_signer_vectors.json.
 * That fixture documents exactly how it was generated: a standalone
 * `node:crypto` one-liner run outside this package (not this package's
 * `sign()`), so the expected values are independently derived, not
 * circular. Per AGENTS.md, fixtures live only under test/fixtures/,
 * prefixed SYNTHETIC_, and are imported only from tests (never from src).
 */
interface SignerVector {
  name: string;
  timestamp: string;
  method: string;
  requestPath: string;
  query: string;
  body: string;
  expectedPreHash: string;
  expectedSignature: string;
}
interface SignerVectorsFixture {
  secret: string;
  vectors: SignerVector[];
}

const fixturePath = fileURLToPath(
  new URL("../test/fixtures/SYNTHETIC_signer_vectors.json", import.meta.url),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as SignerVectorsFixture;

describe("buildPreHash", () => {
  for (const vector of fixture.vectors) {
    it(`matches the independently generated vector: ${vector.name}`, () => {
      const preHash = buildPreHash({
        timestamp: vector.timestamp,
        method: vector.method,
        requestPath: vector.requestPath,
        query: vector.query,
        body: vector.body,
      });
      expect(preHash).toBe(vector.expectedPreHash);
    });
  }

  it("lowercases nothing and uppercases the method", () => {
    const preHash = buildPreHash({
      timestamp: "2026-01-01T00:00:00.000Z",
      method: "get",
      requestPath: "/build/x",
    });
    expect(preHash.slice("2026-01-01T00:00:00.000Z".length)).toBe("GET/build/x");
  });

  it("omits the '?' separator when there is no query", () => {
    const preHash = buildPreHash({
      timestamp: "2026-01-01T00:00:00.000Z",
      method: "GET",
      requestPath: "/build/x",
    });
    expect(preHash).not.toContain("?");
  });
});

describe("sign", () => {
  for (const vector of fixture.vectors) {
    it(`matches the independently generated signature: ${vector.name}`, () => {
      const signature = sign({
        timestamp: vector.timestamp,
        method: vector.method,
        requestPath: vector.requestPath,
        query: vector.query,
        body: vector.body,
        secret: fixture.secret,
      });
      expect(signature).toBe(vector.expectedSignature);
    });
  }

  it("produces a different signature for a different secret", () => {
    const vector = fixture.vectors[0]!;
    const signature = sign({
      timestamp: vector.timestamp,
      method: vector.method,
      requestPath: vector.requestPath,
      query: vector.query,
      body: vector.body,
      secret: "SYNTHETIC_a-different-vector-secret",
    });
    expect(signature).not.toBe(vector.expectedSignature);
  });
});
