import { describe, it, expect, vi } from "vitest";
import type { Product, StoreSlug } from "@accucery/types";

vi.mock("./search.js", () => ({ search: vi.fn() }));

import { compareList } from "./compare.js";
import { search } from "./search.js";

const mockSearch = vi.mocked(search);

function product(overrides: Partial<Product>): Product {
  return {
    productId: "p1",
    name: "unnamed",
    imageUrl: "",
    zone: "none",
    regularPrice: 0,
    loyaltyPrice: null,
    ...overrides,
  };
}

describe("compareList", () => {
  it("prices a matched item by the shopper's own quantity, at the Substitute's Unit Price", async () => {
    // 2 packs of 2L milk at R30 = a 4L need. The target store's only milk
    // is a 1L pack at R8 — 4x cheaper per litre, and 4 litres are needed.
    mockSearch.mockResolvedValue([product({ productId: "m1", name: "Milk 1 L", regularPrice: 8 })]);

    const result = await compareList(
      [{ id: "li1", productId: "orig-1", productName: "Milk 2 L", regularPrice: 30, quantity: 2 }],
      "checkers" as StoreSlug
    );

    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item.matched).toBe(true);
    if (!item.matched) throw new Error("expected a match");
    expect(item.cost).toBeCloseTo(4000 * (8 / 1000)); // 4L need × price-per-ml
    expect(result.total).toBeCloseTo(item.cost);
    expect(result.complete).toBe(true);
    expect(result.unmatchedCount).toBe(0);
  });

  it("keeps an unmatched item in the result rather than dropping it, and excludes it from the total", async () => {
    mockSearch.mockResolvedValue([]); // target store has nothing matching

    const result = await compareList(
      [{ id: "li1", productId: "orig-1", productName: "Milk 2 L", regularPrice: 30, quantity: 1 }],
      "checkers" as StoreSlug
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].matched).toBe(false);
    expect(result.total).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.unmatchedCount).toBe(1);
  });

  it("sums matched items and reports how many of the total went unmatched", async () => {
    mockSearch
      .mockResolvedValueOnce([product({ productId: "m1", name: "Milk 2 L", regularPrice: 25 })])
      .mockResolvedValueOnce([]);

    const result = await compareList(
      [
        { id: "li1", productId: "orig-1", productName: "Milk 2 L", regularPrice: 30, quantity: 1 },
        { id: "li2", productId: "orig-2", productName: "Fresh Chicken Fillets", regularPrice: 90, quantity: 1 },
      ],
      "checkers" as StoreSlug
    );

    expect(result.itemCount).toBe(2);
    expect(result.unmatchedCount).toBe(1);
    expect(result.complete).toBe(false);
    // Only the matched item (~R25) contributes; the total is not R115.
    expect(result.total).toBeLessThan(30);
  });
});
