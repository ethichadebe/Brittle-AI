import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DAILY_CREDITS, CreditBudgetSpent, joburgDay, keepCreditsIn, memoryLedger, resetCredits, spendCredit } from "./creditBudget.js";
import { CheckersScraper, ShopriteScraper, forgetBranches } from "./shopriteGroup.js";

// #157: the free plan's 1,000 credits a month, spread over the days.

beforeEach(() => resetCredits());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the daily allowance", () => {
  it("is 1,000 a month spread evenly", () => {
    expect(DAILY_CREDITS * 30).toBeLessThanOrEqual(1000);
    expect(DAILY_CREDITS * 31).toBeGreaterThan(1000);
  });

  it("allows today's share, then refuses until tomorrow", async () => {
    const today = new Date("2026-10-06T10:00:00+02:00");
    for (let i = 0; i < DAILY_CREDITS; i++) await spendCredit("search", today);
    await expect(spendCredit("search", today)).rejects.toBeInstanceOf(CreditBudgetSpent);
    await expect(spendCredit("branch", today)).rejects.toBeInstanceOf(CreditBudgetSpent);

    await expect(spendCredit("search", new Date("2026-10-07T00:01:00+02:00"))).resolves.toBeUndefined();
  });

  it("turns over at midnight in Joburg, not in UTC", () => {
    expect(joburgDay(new Date("2026-10-06T22:30:00Z"))).toBe("2026-10-07");
    expect(joburgDay(new Date("2026-10-06T21:30:00Z"))).toBe("2026-10-06");
  });

  it("is counted by purpose, so spend can be measured", async () => {
    const recorded: string[] = [];
    keepCreditsIn({ spentOn: async () => 0, record: async (_day, purpose) => void recorded.push(purpose) });
    await spendCredit("search");
    await spendCredit("branch");
    expect(recorded).toEqual(["search", "branch"]);
  });
});

describe("Checkers and Shoprite requests", () => {
  const products = { products: [{ id: 1, name: "Milk 2L", price: 30 }] };
  const sent = () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({ storeContexts: [{ storeId: "s", serviceOptionIds: ["sixty-min-delivery"] }], ...products }) }) as Response;

  beforeEach(() => forgetBranches());

  it("each costs a credit through ScraperAPI, labelled search or branch", async () => {
    vi.stubEnv("SCRAPERAPI_KEY", "test-key");
    const fetchMock = vi.fn().mockImplementation(async () => sent());
    vi.stubGlobal("fetch", fetchMock);
    const ledger = memoryLedger();
    const purposes: string[] = [];
    keepCreditsIn({ spentOn: ledger.spentOn, record: async (day, p) => { purposes.push(p); await ledger.record(day, p); } });

    await new CheckersScraper().search("milk");

    // One branch lookup, one search: one credit each, one request each.
    expect(purposes).toEqual(["branch", "search"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("past the allowance, makes no request at all", async () => {
    vi.stubEnv("SCRAPERAPI_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation(async () => sent());
    vi.stubGlobal("fetch", fetchMock);
    keepCreditsIn({ spentOn: async () => DAILY_CREDITS, record: async () => {} });

    await expect(new ShopriteScraper().search("milk")).rejects.toBeInstanceOf(CreditBudgetSpent);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cost nothing on a developer's own connection, without ScraperAPI", async () => {
    vi.stubEnv("SCRAPERAPI_KEY", "");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => sent()));
    keepCreditsIn({ spentOn: async () => DAILY_CREDITS, record: async () => { throw new Error("should not count"); } });
    await expect(new CheckersScraper().search("milk")).resolves.toHaveLength(1);
  });
});
