import { describe, it, expect } from "vitest";
import { checkCredits, creditLevel, creditMessage } from "./creditAlerts.js";
import { createIncidents, memoryIncidentStore } from "./incidents.js";
import type { Notifier } from "./telegram.js";

describe("ScraperAPI credit alerts (#155)", () => {
  it("warns from 80% and alerts from 95%", () => {
    expect(creditLevel(799, 1000)).toBe(0);
    expect(creditLevel(800, 1000)).toBe(1);
    expect(creditLevel(949, 1000)).toBe(1);
    expect(creditLevel(950, 1000)).toBe(2);
    expect(creditLevel(1024, 1000)).toBe(2);
    expect(creditLevel(5, 0)).toBe(0);
  });

  it("says how many are used, and what runs out", () => {
    expect(creditMessage(1, 812, 1000)).toBe("⚠️ ScraperAPI credits: 812 of 1 000 (81%) used this month. Checkers and Shoprite stop finding prices at 100%.");
    expect(creditMessage(2, 960, 1000)).toContain("🚨");
    expect(creditMessage(0, 3, 1000)).toContain("renewed");
  });

  it("over a month: one warning, one alert, one all-clear, and nothing in between", async () => {
    const sent: string[] = [];
    const notifier: Notifier = { send: async (t) => (sent.push(t), { ok: true }) };
    const incidents = createIncidents(memoryIncidentStore(), notifier, () => {});
    for (const used of [100, 500, 790, 805, 850, 900, 951, 990, 1000, 1024, 2, 40]) {
      await checkCredits(incidents, async () => ({ requestCount: used, requestLimit: 1000 }));
    }
    expect(sent).toHaveLength(3);
    expect(sent[0]).toMatch(/^⚠️ .* 805 of 1 000 \(80%\)/);
    expect(sent[1]).toMatch(/^🚨 .* 951 of 1 000 \(95%\)/);
    expect(sent[2]).toMatch(/^✅ .* 2 of 1 000 \(0%\)/);
  });

  it("changes nothing when ScraperAPI can't be asked, or there's no key", async () => {
    const sent: string[] = [];
    const notifier: Notifier = { send: async (t) => (sent.push(t), { ok: true }) };
    const incidents = createIncidents(memoryIncidentStore(), notifier, () => {});
    await checkCredits(incidents, async () => "403 Forbidden");
    await checkCredits(incidents, async () => null);
    await checkCredits(incidents, async () => ({}));
    expect(sent).toEqual([]);
  });
});
