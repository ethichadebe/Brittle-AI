import { describe, it, expect } from "vitest";
import { safeReturnPath } from "./returnPath";

describe("safeReturnPath", () => {
  it("returns to a path inside the app", () => {
    expect(safeReturnPath("/lists/abc")).toBe("/lists/abc");
  });

  it("never leaves the app", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/profile");
    expect(safeReturnPath("//evil.example")).toBe("/profile");
    expect(safeReturnPath("/\\evil.example")).toBe("/profile");
    expect(safeReturnPath("javascript:alert(1)")).toBe("/profile");
  });

  it("falls back when there's nowhere to return to", () => {
    expect(safeReturnPath(undefined)).toBe("/profile");
    expect(safeReturnPath(42, "/")).toBe("/");
  });
});
