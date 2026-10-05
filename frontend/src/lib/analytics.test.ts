import { describe, it, expect, beforeEach } from "vitest";
import { cleanPath, resetAnalytics, startAnalytics, track, trackPage } from "./analytics";
import { isMeasurementId } from "../analyticsConfig";

// What Google Analytics is told. A stand-in window: no DOM, no network.

function fakeWindow(pathname = "/") {
  const scripts: { async: boolean; src: string }[] = [];
  const w = {
    dataLayer: undefined as unknown[] | undefined,
    location: { origin: "https://accucery.example", pathname },
    document: {
      createElement: () => ({ async: false, src: "" }) as unknown as HTMLScriptElement,
      head: { appendChild: (s: unknown) => scripts.push(s as { async: boolean; src: string }) },
    },
  };
  return { w, scripts, hits: () => (w.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>)) };
}

beforeEach(() => resetAnalytics());

describe("cleaning an address before Google sees it", () => {
  it("drops the query and hash, so a link's token never leaves the app", () => {
    expect(cleanPath("/confirm-email?token=abcDEF_123")).toBe("/confirm-email");
    expect(cleanPath("/reset-password?token=x#y")).toBe("/reset-password");
  });

  it("turns list ids into :id, so every list counts as one screen", () => {
    expect(cleanPath("/lists/3f2a9c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6")).toBe("/lists/:id");
    expect(cleanPath("/lists/new")).toBe("/lists/new");
    expect(cleanPath("/")).toBe("/");
    expect(cleanPath("/profile/")).toBe("/profile");
  });
});

describe("starting", () => {
  it("does nothing without a real Measurement ID", () => {
    const { w, scripts } = fakeWindow();
    for (const id of ["", "UA-12345-1", "G-", "g-abc123"]) expect(startAnalytics(id, w)).toBe(false);
    expect(scripts).toEqual([]);
    expect(isMeasurementId("G-ABC123XYZ")).toBe(true);
  });

  it("loads gtag.js once, with no advertising signals and no automatic page view", () => {
    const { w, scripts, hits } = fakeWindow("/lists/3f2a9c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6");
    expect(startAnalytics("G-TEST1234", w)).toBe(true);
    expect(startAnalytics("G-TEST1234", w)).toBe(false);

    expect(scripts).toEqual([{ async: true, src: "https://www.googletagmanager.com/gtag/js?id=G-TEST1234" }]);
    const config = hits().find((h) => h[0] === "config")!;
    expect(config[1]).toBe("G-TEST1234");
    expect(config[2]).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: "https://accucery.example/lists/:id",
    });
  });

  it("hands gtag.js Arguments objects, which is all it reads", () => {
    const { w } = fakeWindow();
    startAnalytics("G-TEST1234", w);
    expect(Object.prototype.toString.call(w.dataLayer![0])).toBe("[object Arguments]");
  });
});

describe("what is sent", () => {
  it("page views carry the cleaned address only", () => {
    const { w, hits } = fakeWindow();
    startAnalytics("G-TEST1234", w);
    trackPage("/confirm-email?token=secret-token-value");
    const sent = JSON.stringify(hits());
    expect(sent).toContain('"page_location":"https://accucery.example/confirm-email"');
    expect(sent).not.toContain("secret-token-value");
  });

  it("actions carry store names, and nothing else a caller passes", () => {
    const { w, hits } = fakeWindow();
    startAnalytics("G-TEST1234", w);
    trackPage("/lists/3f2a9c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6");
    track("compare_run", { store: "checkers", target: "pick-n-pay", email: "thandi@example.com" } as never);
    const event = hits().find((h) => h[1] === "compare_run")!;
    expect(event[2]).toEqual({ store: "checkers", target: "pick-n-pay", page_location: "https://accucery.example/lists/:id" });
  });

  it("before starting, nothing is recorded anywhere", () => {
    const { w } = fakeWindow();
    trackPage("/");
    track("list_created", { store: "checkers" });
    expect(w.dataLayer).toBeUndefined();
  });
});
