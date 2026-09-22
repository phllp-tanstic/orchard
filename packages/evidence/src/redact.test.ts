import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { redactRequestParams, DEFAULT_SENSITIVE_PARAMS } from "./redact.js";

describe("redactRequestParams", () => {
  it("replaces a sensitive param with a salted sha256 hash, prefixed", () => {
    const out = redactRequestParams(
      { userWalletAddress: "0xABCDEF", binanceChainId: 56 },
      { salt: "SYNTHETIC_SALT" },
    );
    const expectedHash = createHash("sha256")
      .update("SYNTHETIC_SALT:userWalletAddress=0xABCDEF")
      .digest("hex");
    expect(out["userWalletAddress"]).toBe(`sha256:${expectedHash}`);
    expect(out["binanceChainId"]).toBe(56);
  });

  it("uses DEFAULT_SENSITIVE_PARAMS by default (userWalletAddress, address)", () => {
    expect(DEFAULT_SENSITIVE_PARAMS).toContain("userWalletAddress");
    expect(DEFAULT_SENSITIVE_PARAMS).toContain("address");

    const out = redactRequestParams({ address: "0x1", other: "kept" }, { salt: "s" });
    expect(out["address"]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(out["other"]).toBe("kept");
  });

  it("produces different hashes for different salts (salt actually matters)", () => {
    const a = redactRequestParams({ address: "0x1" }, { salt: "salt-a" });
    const b = redactRequestParams({ address: "0x1" }, { salt: "salt-b" });
    expect(a["address"]).not.toBe(b["address"]);
  });

  it("respects a custom sensitiveParams list", () => {
    const out = redactRequestParams(
      { customSecret: "value", address: "0x1" },
      { salt: "s", sensitiveParams: ["customSecret"] },
    );
    expect(out["customSecret"]).toMatch(/^sha256:/);
    // address is not in the custom list, so it passes through unredacted here.
    expect(out["address"]).toBe("0x1");
  });

  it("is deterministic for the same key/value/salt", () => {
    const a = redactRequestParams({ address: "0x1" }, { salt: "s" });
    const b = redactRequestParams({ address: "0x1" }, { salt: "s" });
    expect(a["address"]).toBe(b["address"]);
  });
});
