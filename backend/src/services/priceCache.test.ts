import { describe, it, expect, vi, beforeEach } from "vitest";
import { isFresh, TTL_MS, refreshItems } from "./priceCache.js";

vi.mock("../db.js", () => ({
  prisma: {
    priceCache: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
}));

import { searchProducts } from "../scraper/engine.js";
import { prisma } from "../db.js";

const mockSearch = vi.mocked(searchProducts);
const mockUpsert = vi.mocked(prisma.priceCache.upsert);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isFresh", () => {
  it("returns true for a timestamp within TTL", () => {
    const recent = new Date(Date.now() - TTL_MS / 2);
    expect(isFresh(recent)).toBe(true);
  });

  it("returns false for a timestamp exactly at TTL boundary", () => {
    const boundary = new Date(Date.now() - TTL_MS - 1);
    expect(isFresh(boundary)).toBe(false);
  });

  it("returns false for a stale timestamp", () => {
    const stale = new Date(Date.now() - TTL_MS * 2);
    expect(isFresh(stale)).toBe(false);
  });
});

describe("refreshItems", () => {
  const product = {
    productId: "abc123",
    name: "Clover Milk 1L",
    imageUrl: "https://example.com/img.jpg",
    zone: "p10",
    regularPrice: 22.99,
    loyaltyPrice: 19.99,
  };

  it("calls scraper and upserts cache when product is found", async () => {
    mockSearch.mockResolvedValue([product]);

    await refreshItems("checkers", [{ productId: "abc123", productName: "Clover Milk 1L" }]);

    expect(mockSearch).toHaveBeenCalledOnce();
    expect(mockSearch).toHaveBeenCalledWith("checkers", "Clover Milk 1L");
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeSlug_productId_zone: { storeSlug: "checkers", productId: "abc123", zone: "p10" },
        },
      })
    );
  });

  // The whole point of keying price_cache by zone: two zones for the same
  // product must be two rows, never one overwriting the other. Removing
  // `zone` from upsertCache's `where` (collapsing back to the old
  // storeSlug_productId key) makes this fail by upserting the same row twice.
  it("keys the cache upsert by zone, not just store and product", async () => {
    mockSearch.mockResolvedValueOnce([{ ...product, zone: "p10" }]);
    await refreshItems("checkers", [{ productId: "abc123", productName: "Clover Milk 1L" }]);

    mockSearch.mockResolvedValueOnce([{ ...product, zone: "p30" }]);
    await refreshItems("checkers", [{ productId: "abc123", productName: "Clover Milk 1L" }]);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    const zonesUsed = mockUpsert.mock.calls.map((call) => call[0]!.where.storeSlug_productId_zone!.zone);
    expect(zonesUsed).toEqual(["p10", "p30"]);
  });

  it("does not upsert when scraper returns no matching product", async () => {
    mockSearch.mockResolvedValue([{ ...product, productId: "other" }]);

    await refreshItems("checkers", [{ productId: "abc123", productName: "Clover Milk 1L" }]);

    expect(mockSearch).toHaveBeenCalledOnce();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("handles scraper errors without throwing", async () => {
    mockSearch.mockRejectedValue(new Error("network error"));

    await expect(
      refreshItems("checkers", [{ productId: "abc123", productName: "Clover Milk 1L" }])
    ).resolves.toBeUndefined();

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("processes multiple items independently", async () => {
    mockSearch
      .mockResolvedValueOnce([product])
      .mockResolvedValueOnce([{ ...product, productId: "def456", name: "Blue Ribbon Bread" }]);

    await refreshItems("checkers", [
      { productId: "abc123", productName: "Clover Milk 1L" },
      { productId: "def456", productName: "Blue Ribbon Bread" },
    ]);

    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
