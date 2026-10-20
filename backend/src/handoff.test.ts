import { afterEach, describe, expect, it } from "vitest";
import { HANDOFF_TTL_MS, MAX_PENDING_HANDOFFS, clearHandoffs, createHandoff, safePath, takeHandoff } from "./handoff.js";

const ID = "6f1c2b8e-1f5e-4a51-9c33-3b7a2f4d9e10";

afterEach(() => clearHandoffs());

describe("a handover code", () => {
  it("stands for the device id it was made for", () => {
    const code = createHandoff(ID)!;
    expect(code).not.toContain(ID);
    expect(takeHandoff(code)).toBe(ID);
  });

  it("works once", () => {
    const code = createHandoff(ID)!;
    takeHandoff(code);
    expect(takeHandoff(code)).toBeNull();
  });

  it("expires", () => {
    const code = createHandoff(ID, 1_000)!;
    expect(takeHandoff(code, 1_000 + HANDOFF_TTL_MS)).toBeNull();
  });

  it("is never guessed: an unknown or missing code stands for nothing", () => {
    createHandoff(ID);
    expect(takeHandoff("not-a-code")).toBeNull();
    expect(takeHandoff(undefined)).toBeNull();
  });

  it("stops being issued past the cap, until old ones expire", () => {
    for (let i = 0; i < MAX_PENDING_HANDOFFS; i++) createHandoff(ID, 0);
    expect(createHandoff(ID, 1)).toBeNull();
    expect(createHandoff(ID, HANDOFF_TTL_MS + 1)).not.toBeNull();
  });
});

describe("where a handover lands", () => {
  it("keeps a page on this site, with its query", () => {
    expect(safePath("/lists/abc?tab=compare")).toBe("/lists/abc?tab=compare");
    expect(safePath("/")).toBe("/");
  });

  it("never sends anyone to another site", () => {
    for (const to of ["//evil.example", "/\\evil.example", "https://evil.example", "evil.example", "/\tevil", ""]) {
      expect(safePath(to), JSON.stringify(to)).toBe("/");
    }
  });

  it("never lands back in the API", () => {
    expect(safePath("/api/handoff/send")).toBe("/");
    expect(safePath("/api")).toBe("/");
  });

  it("falls back to home for anything that isn't a path", () => {
    expect(safePath(undefined)).toBe("/");
    expect(safePath(["/a"])).toBe("/");
    expect(safePath("/" + "a".repeat(3000))).toBe("/");
  });
});
