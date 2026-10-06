import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { countCredit, joburgDay, keepCreditsIn, memoryLedger, resetCredits } from "./credits.js";
import { CheckersScraper, ShopriteScraper, forgetBranches } from "./shopriteGroup.js";

// #157: every ScraperAPI request is counted, by day and purpose. Nothing is
// ever refused for want of credits (decided with the owner).

beforeEach(() => resetCredits());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("counting credits", () => {
  it("counts by Joburg day and purpose", async () => {
    const ledger = memoryLedger();
    keepCreditsIn(ledger);
    await countCredit("search", new Date("2026-10-06T10:00:00+02:00"));
    await countCredit("search", new Date("2026-10-06T23:30:00+02:00"));
    await countCredit("branch", new Date("2026-10-06T22:30:00Z")); // 00:30 on the 7th in Joburg
    expect(Object.fromEntries(ledger.spent)).toEqual({ "2026-10-06 search": 2, "2026-10-07 branch": 1 });
  });

  it("a day turns over at midnight in Joburg, not in UTC", () => {
    expect(joburgDay(new Date("2026-10-06T22:30:00Z"))).toBe("2026-10-07");
    expect(joburgDay(new Date("2026-10-06T21:30:00Z"))).toBe("2026-10-06");
  });

  it("a count that can't be saved never holds a request up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    keepCreditsIn({ record: () => Promise.reject(new Error("db down")) });
    await expect(countCredit("search")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("Checkers and Shoprite requests", () => {
  const reply = () =>
    ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ storeContexts: [{ storeId: "s", serviceOptionIds: ["sixty-min-delivery"] }], products: [{ id: 1, name: "Milk 2L", price: 30 }] }),
    }) as Response;

  beforeEach(() => forgetBranches());

  it("each counts a credit through ScraperAPI, labelled search or branch", async () => {
    vi.stubEnv("SCRAPERAPI_KEY", "test-key");
    const fetchMock = vi.fn().mockImplementation(async () => reply());
    vi.stubGlobal("fetch", fetchMock);
    const purposes: string[] = [];
    keepCreditsIn({ record: async (_day, p) => void purposes.push(p) });

    await new CheckersScraper().search("milk");

    // One branch lookup, one search: one credit each, one request each.
    expect(purposes).toEqual(["branch", "search"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("are never refused, however many have been spent", async () => {
    vi.stubEnv("SCRAPERAPI_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply()));
    const ledger = memoryLedger();
    keepCreditsIn(ledger);
    for (let i = 0; i < 200; i++) await countCredit("search");
    await expect(new ShopriteScraper().search("milk")).resolves.toHaveLength(1);
  });

  it("cost nothing on a developer's own connection, without ScraperAPI", async () => {
    vi.stubEnv("SCRAPERAPI_KEY", "");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply()));
    const purposes: string[] = [];
    keepCreditsIn({ record: async (_day, p) => void purposes.push(p) });
    await expect(new CheckersScraper().search("milk")).resolves.toHaveLength(1);
    expect(purposes).toEqual([]);
  });
});
