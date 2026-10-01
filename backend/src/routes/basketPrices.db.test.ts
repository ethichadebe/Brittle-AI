import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { ListItem, Product } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { TTL_MS as BASKET_WINDOW_MS } from "../services/priceCache.js";
import { TTL_MS as INDICATIVE_WINDOW_MS } from "../services/searchCache.js";

// #77: only the store is faked. Prices, their timestamps and the refresh
// all run for real against the test database, with no network access.
vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn(),
}));

import { searchProducts, currentZone } from "../scraper/engine.js";

const mockSearch = vi.mocked(searchProducts);
const mockZone = vi.mocked(currentZone);

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
  mockZone.mockReturnValue("none");
  mockSearch.mockResolvedValue([]);
});

const deviceId = randomUUID();
const inject = (opts: InjectOptions) => app.inject({ ...opts, cookies: { [DEVICE_ID_COOKIE]: deviceId } });

const ago = (ms: number) => new Date(Date.now() - ms);
const HOUR = 60 * 60 * 1000;

// The background refresh state is per product and lives for the process,
// so every test uses its own product ids.
function fixture() {
  const id = randomUUID().slice(0, 8);
  const productId = `p-${id}`;
  const productName = `Milk ${id} 2 L`;
  const product = (regularPrice: number): Product => ({
    productId,
    name: productName,
    imageUrl: "",
    zone: "none",
    regularPrice,
    loyaltyPrice: null,
  });
  return { productId, productName, product };
}

async function listWith(items: { productId: string; productName: string; regularPrice: number }[]) {
  const list = await testPrisma.list.create({ data: { storeSlug: "checkers", name: "Monthly", userId: deviceId } });
  for (const item of items) {
    await testPrisma.listItem.create({ data: { listId: list.id, imageUrl: "", loyaltyPrice: null, ...item } });
  }
  return list.id;
}

async function observed(productId: string, productName: string, regularPrice: number, scrapedAt: Date) {
  await testPrisma.priceCache.create({
    data: { storeSlug: "checkers", productId, productName, imageUrl: "", zone: "none", regularPrice, loyaltyPrice: null, scrapedAt },
  });
}

async function openList(listId: string): Promise<ListItem[]> {
  const res = await inject({ method: "GET", url: `/lists/${listId}/items` });
  expect(res.statusCode).toBe(200);
  return res.json().items;
}

describe("Basket Prices on an opened list (#77)", () => {
  it("never lets a list total show an Indicative Price: one older than the Basket window is refreshed", async () => {
    const { productId, productName, product } = fixture();
    // Fresh enough for a search result, too old for a list total.
    const age = 2 * HOUR;
    expect(age).toBeGreaterThan(BASKET_WINDOW_MS);
    expect(age).toBeLessThan(INDICATIVE_WINDOW_MS);
    await observed(productId, productName, 30, ago(age));
    const listId = await listWith([{ productId, productName, regularPrice: 30 }]);
    mockSearch.mockResolvedValue([product(27)]);

    const [first] = await openList(listId);
    expect(first.priceStatus, "a list total showed an indicative price as if it were current").toBe("updating");
    expect(mockSearch).toHaveBeenCalledWith("checkers", productName);

    await vi.waitFor(async () => {
      const [item] = await openList(listId);
      expect(item.priceStatus).toBe("current");
      expect(item.regularPrice).toBe(27);
    });
  });

  it("treats a price inside the Basket window as current, and scrapes nothing", async () => {
    const { productId, productName } = fixture();
    await observed(productId, productName, 30, ago(BASKET_WINDOW_MS / 2));
    const listId = await listWith([{ productId, productName, regularPrice: 30 }]);

    const [item] = await openList(listId);

    expect(item.priceStatus).toBe("current");
    expect(item.regularPrice).toBe(30);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refreshes only the items on the opened list", async () => {
    const onList = fixture();
    const elsewhere = fixture();
    await observed(onList.productId, onList.productName, 30, ago(3 * HOUR));
    await observed(elsewhere.productId, elsewhere.productName, 30, ago(3 * HOUR));
    const listId = await listWith([{ productId: onList.productId, productName: onList.productName, regularPrice: 30 }]);
    mockSearch.mockResolvedValue([onList.product(28)]);

    await openList(listId);
    await vi.waitFor(async () => expect((await openList(listId))[0].priceStatus).toBe("current"));

    expect(mockSearch.mock.calls.map(([, query]) => query)).not.toContain(elsewhere.productName);
  });

  it("keeps a price it couldn't refresh, marked outdated, without re-scraping on every request", async () => {
    const { productId, productName } = fixture();
    const observedAt = ago(5 * HOUR);
    await observed(productId, productName, 30, observedAt);
    const listId = await listWith([{ productId, productName, regularPrice: 30 }]);
    // The store no longer returns this product.
    mockSearch.mockResolvedValue([]);

    expect((await openList(listId))[0].priceStatus).toBe("updating");
    await vi.waitFor(async () => expect((await openList(listId))[0].priceStatus).toBe("outdated"));

    const [item] = await openList(listId);
    expect(item.regularPrice).toBe(30);
    expect(item.priceObservedAt).toBe(observedAt.toISOString());
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });
});

describe("Adding an item (#77)", () => {
  it("does not make a day-old price look fresh, nor write the phone's price into the shared cache", async () => {
    const { productId, productName, product } = fixture();
    // A search served from the day-long search cache showed this price.
    const observedAt = ago(20 * HOUR);
    await observed(productId, productName, 30, observedAt);
    const list = await testPrisma.list.create({ data: { storeSlug: "checkers", name: "Monthly", userId: deviceId } });
    mockSearch.mockResolvedValue([product(26)]);

    // A phone sending a price that isn't what Accucery observed.
    const res = await inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: { productId, productName, imageUrl: "", regularPrice: 1, loyaltyPrice: null, quantity: 1 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().priceStatus).toBe("updating");
    expect(res.json().regularPrice).toBe(30);

    // The refresh is what moves the cached price; the add never does.
    await vi.waitFor(async () => expect((await openList(list.id))[0].priceStatus).toBe("current"));
    const rows = await testPrisma.priceCache.findMany({ where: { productId } });
    expect(rows.map((r) => r.regularPrice.toNumber())).toEqual([26]);
  });
});

describe("A list total on the home screen (#77)", () => {
  it("is estimated from the latest observed price, not the price when added, and scrapes nothing", async () => {
    const { productId, productName } = fixture();
    await testPrisma.list.deleteMany({ where: { userId: deviceId } });
    // Added at R40 weeks ago; Accucery has since observed R32.
    await listWith([{ productId, productName, regularPrice: 40 }]);
    await observed(productId, productName, 32, ago(3 * HOUR));

    const res = await inject({ method: "GET", url: "/lists" });

    expect(res.json().lists[0].totalPrice).toBe(32);
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
