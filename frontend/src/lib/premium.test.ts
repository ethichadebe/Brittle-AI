import { describe, it, expect } from "vitest";
import type { PremiumStatus } from "@accucery/types";
import { outcomeMessage, priceLine, statusLine, yearlySaving } from "./premium";

const base: PremiumStatus = {
  available: true,
  premium: true,
  plan: "monthly",
  accessUntil: "2026-11-14T10:00:00.000Z",
  trialEndsAt: null,
  trialing: false,
  cancelled: false,
  trialAvailable: false,
  prices: { monthly: 2900, yearly: 24900 },
  trialDays: 7,
};

describe("Premium's words", () => {
  it("prices in rands, without cents when there are none", () => {
    // The app's own rand format (formatRand), as on every price.
    expect(priceLine("monthly", 2900)).toMatch(/^R\s29 a month$/);
    expect(priceLine("yearly", 24900)).toMatch(/^R\s249 a year$/);
  });

  it("works out what a year saves", () => {
    expect(yearlySaving(base.prices)).toBe(28);
  });

  it("says when a trial ends and what follows, or that it won't be charged", () => {
    const trial = { ...base, trialing: true, trialEndsAt: "2026-10-20T10:00:00.000Z" };
    expect(statusLine(trial)).toMatch(/^Free trial until 20 October 2026, then R\s29 a month\.$/);
    expect(statusLine({ ...trial, cancelled: true })).toBe("Free trial until 20 October 2026. Cancelled, so you won't be charged.");
  });

  it("says when a paid plan renews, or ends", () => {
    expect(statusLine(base)).toBe("Renews automatically. Paid up until 14 November 2026.");
    expect(statusLine({ ...base, cancelled: true })).toBe("Premium until 14 November 2026. It won't renew.");
    expect(statusLine({ ...base, premium: false })).toBe("");
  });

  it("tells a refused trial that the card check was refunded, and what to do", () => {
    const m = outcomeMessage("trial-used", null);
    expect(m.ok).toBe(false);
    expect(m.body).toContain("refunded");
    expect(m.body).toContain("subscribe without a trial");
  });

  it("names the trial's end on the way back from Paystack", () => {
    const m = outcomeMessage("trial-started", { ...base, trialing: true, trialEndsAt: "2026-10-20T10:00:00.000Z" });
    expect(m).toMatchObject({ ok: true, title: "Your free trial has started" });
    expect(m.body).toContain("20 October 2026");
  });
});
