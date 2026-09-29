import { describe, it, expect } from "vitest";
import { opaqueZone, NO_ZONE, UNCONFIGURED_ZONE } from "./zone.js";

describe("opaqueZone", () => {
  it("is unconfigured for an empty cookie", () => {
    expect(opaqueZone("")).toBe(UNCONFIGURED_ZONE);
  });

  it("is unconfigured for a whitespace-only cookie", () => {
    expect(opaqueZone("   ")).toBe(UNCONFIGURED_ZONE);
  });

  it("is deterministic for the same cookie", () => {
    expect(opaqueZone("storeContexts=abc")).toBe(opaqueZone("storeContexts=abc"));
  });

  it("differs for a different cookie", () => {
    expect(opaqueZone("storeContexts=abc")).not.toBe(opaqueZone("storeContexts=xyz"));
  });

  it("never contains the cookie's own text", () => {
    const cookie = "storeContexts=super-secret-branch-id";
    expect(opaqueZone(cookie)).not.toContain("super-secret-branch-id");
    expect(opaqueZone(cookie)).not.toBe(cookie);
  });

  it("is not the same value as the no-zone constant", () => {
    expect(opaqueZone("storeContexts=abc")).not.toBe(NO_ZONE);
  });
});
