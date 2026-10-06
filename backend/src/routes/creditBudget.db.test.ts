import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { ListItem } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { CreditBudgetSpent } from "../scraper/creditBudget.js";
import { databaseLedger } from "../scraper/creditLedger.js";
import { signUp } from "../test/signUp.js";

// #157: what a shopper sees once today's ScraperAPI allowance is spent. Only
// the store is faked: it answers "allowance spent", as the real one does.
vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn(),
  nearestBranch: vi.fn(),
}));

import { searchProducts, currentZone, nearestBranch } from "../scraper/engine.js";

const mockSearch = vi.mocked(searchProducts);
const SPENT = "Checkers and Shoprite have used today's price checks. Saved prices still show; new searches there work again tomorrow.";

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentZone).mockResolvedValue("z1");
  mockSearch.mockRejectedValue(new CreditBudgetSpent());
});

const deviceId = randomUUID();
const inject = (opts: InjectOptions) => app.inject({ ...opts, cookies: { [DEVICE_ID_COOKIE]: deviceId } });
const DAY = 24 * 60 * 60 * 1000;

async function saved(productId: string, price: number, scrapedAt: Date) {
  await testPrisma.priceCache.create({
    data: { storeSlug: "checkers", productId, productName: `Milk ${productId}`, imageUrl: "", zone: "z1", regularPrice: price, loyaltyPrice: null, scrapedAt },
  });
}

describe("a search once the allowance is spent", () => {
  it("says so plainly when nothing is saved for it", async () => {
    const res = await inject({ method: "GET", url: `/search?store=checkers&q=eggs-${randomUUID()}` });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: SPENT });
  });

  it("shows the last saved answer, however old, rather than nothing", async () => {
    const id = `old-${randomUUID().slice(0, 8)}`;
    await saved(id, 31.99, new Date(Date.now() - 10 * DAY));
    await testPrisma.searchCache.create({
      data: { storeSlug: "checkers", zone: "z1", query: "milk", productIds: [id], scrapedAt: new Date(Date.now() - 10 * DAY) },
    });

    const res = await inject({ method: "GET", url: "/search?store=checkers&q=milk" });

    expect(res.statusCode).toBe(200);
    expect(res.json().products.map((p: { productId: string }) => p.productId)).toEqual([id]);
  });
});

describe("a list once the allowance is spent", () => {
  it("keeps every saved price, marked outdated, and asks the store only once", async () => {
    const ids = [1, 2, 3].map((i) => `item${i}-${randomUUID().slice(0, 8)}`);
    const list = await testPrisma.list.create({ data: { storeSlug: "checkers", name: "Monthly", userId: deviceId } });
    for (const id of ids) {
      await saved(id, 20, new Date(Date.now() - 2 * DAY));
      await testPrisma.listItem.create({ data: { listId: list.id, productId: id, productName: `Milk ${id}`, imageUrl: "", regularPrice: 20, loyaltyPrice: null } });
    }
    const open = async () => (await inject({ method: "GET", url: `/lists/${list.id}/items` })).json().items as ListItem[];

    await open();
    await vi.waitFor(async () => expect((await open()).every((i) => i.priceStatus === "outdated")).toBe(true));

    const items = await open();
    expect(items.map((i) => i.regularPrice)).toEqual([20, 20, 20]);
    // The first refusal stops the rest: no request per item.
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });
});

describe("finding a branch once the allowance is spent", () => {
  it("says it's the day's allowance, not the store, and to try tomorrow", async () => {
    vi.mocked(nearestBranch).mockRejectedValue(new CreditBudgetSpent());
    vi.spyOn(console, "error").mockImplementation(() => {});
    const list = await testPrisma.list.create({ data: { storeSlug: "shoprite", name: "Weekly", userId: deviceId } });

    const res = await inject({ method: "PUT", url: `/lists/${list.id}/location`, payload: { latitude: -26.1, longitude: 28.05 } });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/today's are used up\. Try again tomorrow\.$/);
  });
});

describe("a comparison once the allowance is spent", () => {
  it("says so, rather than failing with a server error", async () => {
    const signedUp = await signUp((o) => app.inject(o), { email: `c-${randomUUID()}@example.com`, password: "long-enough-pw" });
    const cookies = Object.fromEntries(signedUp.cookies.map((c) => [c.name, c.value]));
    const list = (await app.inject({ method: "POST", url: "/lists", payload: { storeSlug: "pick-n-pay", name: "L" }, cookies })).json();
    await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: { productId: "p1", productName: "Milk 2L", imageUrl: "", regularPrice: 30, loyaltyPrice: null, quantity: 1 },
      cookies,
    });

    const res = await app.inject({ method: "POST", url: `/lists/${list.id}/compare`, payload: { targetStore: "checkers" }, cookies });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: SPENT });
  });
});

describe("the spend ledger", () => {
  it("counts by day and purpose, and sums a day", async () => {
    await databaseLedger.record("2026-10-06", "search");
    await databaseLedger.record("2026-10-06", "search");
    await databaseLedger.record("2026-10-06", "branch");
    await databaseLedger.record("2026-10-07", "search");

    expect(await databaseLedger.spentOn("2026-10-06")).toBe(3);
    expect(await databaseLedger.spentOn("2026-10-07")).toBe(1);
    expect(await databaseLedger.spentOn("2026-10-08")).toBe(0);
    const rows = await testPrisma.creditSpend.findMany({ where: { day: "2026-10-06" }, orderBy: { purpose: "asc" } });
    expect(rows.map((r) => `${r.purpose}:${r.count}`)).toEqual(["branch:1", "search:2"]);
  });
});
