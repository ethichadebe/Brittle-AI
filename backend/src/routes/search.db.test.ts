import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import type { FastifyInstance } from "fastify";

vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn(),
}));

import { searchProducts, currentZone } from "../scraper/engine.js";

const mockSearch = vi.mocked(searchProducts);
const mockZone = vi.mocked(currentZone);

let app: FastifyInstance;

const milk = {
  productId: "milk-1",
  name: "Clover Full Cream Milk 2L",
  imageUrl: "https://example.com/milk.jpg",
  zone: "p10",
  regularPrice: 29.99,
  loyaltyPrice: 26.99,
};

const bread = {
  productId: "bread-1",
  name: "Albany White Bread 700g",
  imageUrl: "https://example.com/bread.jpg",
  zone: "p10",
  regularPrice: 19.99,
  loyaltyPrice: null,
};

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
  await app.ready();
  mockZone.mockResolvedValue("p10");
});

const search = (store: string, q: string) =>
  app.inject({ method: "GET", url: `/search?store=${store}&q=${encodeURIComponent(q)}` });

// #76: no network access anywhere in this suite, and zero ScraperAPI
// credits spent — `searchProducts` and `currentZone` are fully mocked, so a
// real scraper class is never constructed.
describe("GET /search — caching", () => {
  it("calls the scraper exactly once for two identical searches", async () => {
    mockSearch.mockResolvedValue([milk]);

    await search("checkers", "milk");
    await search("checkers", "milk");

    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("resolves Milk, milk and milk (trailing space) to the same cache row", async () => {
    mockSearch.mockResolvedValue([milk]);

    await search("checkers", "Milk");
    await search("checkers", "milk");
    await search("checkers", "milk ");

    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("is a miss for the same query at a different store", async () => {
    mockSearch.mockResolvedValue([milk]);

    await search("checkers", "milk");
    await search("shoprite", "milk");

    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  // Dropping the zone from search_cache's key is the exact bug this issue
  // exists to prevent — this test fails naming the zone if it happens.
  it("is a miss for the same query in a different zone", async () => {
    mockSearch.mockResolvedValue([milk]);

    mockZone.mockResolvedValue("p10");
    await search("checkers", "milk");

    mockZone.mockResolvedValue("p30");
    await search("checkers", "milk");

    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  // Inverting the freshness comparison would make this pass by never
  // re-scraping, which is exactly what this test exists to catch.
  it("scrapes again once a cached search is older than the Indicative Price window", async () => {
    mockSearch.mockResolvedValue([milk]);
    await search("checkers", "milk");
    expect(mockSearch).toHaveBeenCalledOnce();

    await testPrisma.searchCache.update({
      where: { storeSlug_zone_query: { storeSlug: "checkers", zone: "p10", query: "milk" } },
      // Checkers' window is 3 days (#157).
      data: { scrapedAt: new Date(Date.now() - 73 * 60 * 60 * 1000) },
    });

    await search("checkers", "milk");
    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  it("returns the store's original ordering on a cache hit, not database order", async () => {
    mockSearch.mockResolvedValue([bread, milk]); // store returned bread first

    await search("checkers", "milk"); // populates the cache
    const res = await search("checkers", "milk"); // served from cache

    expect(res.json().products.map((p: { productId: string }) => p.productId)).toEqual([
      "bread-1",
      "milk-1",
    ]);
  });

  it("serves a hit's prices from price_cache, with no second copy anywhere", async () => {
    mockSearch.mockResolvedValue([milk]);
    await search("checkers", "milk"); // populates price_cache and search_cache

    // Change only price_cache — if a hit read a duplicated price instead,
    // this update would have no effect on what /search returns.
    await testPrisma.priceCache.update({
      where: {
        storeSlug_productId_zone: { storeSlug: "checkers", productId: "milk-1", zone: "p10" },
      },
      data: { regularPrice: 24.99 },
    });

    const res = await search("checkers", "milk");
    expect(res.json().products[0].regularPrice).toBe(24.99);
    expect(mockSearch).toHaveBeenCalledOnce(); // still a hit, not a re-scrape
  });

  it("does not cache an empty result, so a later real result is still found", async () => {
    mockSearch.mockResolvedValueOnce([]);
    await search("checkers", "qwertyuiop");

    mockSearch.mockResolvedValueOnce([milk]);
    const res = await search("checkers", "qwertyuiop");

    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(res.json().products).toHaveLength(1);
  });
});
