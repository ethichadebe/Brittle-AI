import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signatureValid } from "./paystack.js";

// #171: only Paystack can make anyone Premium, and this is how it's told apart.
const SECRET = "sk_test_unit_secret"; // gitleaks:allow — invented test value, not a real key
const body = '{"event":"charge.success","data":{"reference":"r1"}}';
const sign = (b: string, key = SECRET) => createHmac("sha512", key).update(b).digest("hex");

describe("a Paystack webhook's signature", () => {
  it("is accepted when it's the HMAC-SHA512 of the exact body with the secret key", () => {
    expect(signatureValid(body, sign(body), SECRET)).toBe(true);
    expect(signatureValid(Buffer.from(body), sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it("is refused for another key, another body, or a re-spaced body", () => {
    expect(signatureValid(body, sign(body, "sk_test_other"), SECRET)).toBe(false);
    expect(signatureValid(body.replace("r1", "r2"), sign(body), SECRET)).toBe(false);
    expect(signatureValid(body.replace(":", ": "), sign(body), SECRET)).toBe(false);
  });

  it("is refused when missing, malformed, or when no key is set", () => {
    expect(signatureValid(body, undefined, SECRET)).toBe(false);
    expect(signatureValid(body, ["x"], SECRET)).toBe(false);
    expect(signatureValid(body, "abc", SECRET)).toBe(false);
    expect(signatureValid(body, sign(body, ""), "")).toBe(false);
  });
});
