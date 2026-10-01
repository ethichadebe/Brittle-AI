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
      [{ id: "li1", productId: "orig-1", productName: "Milk 2 L", regularPrice: 30, quantity: 2, imageUrl: "" }],
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
      [{ id: "li1", productId: "orig-1", productName: "Milk 2 L", regularPrice: 30, quantity: 1, imageUrl: "" }],
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
        { id: "li1", productId: "orig-1", productName: "Milk 2 L", regularPrice: 30, quantity: 1, imageUrl: "" },
        { id: "li2", productId: "orig-2", productName: "Fresh Chicken Fillets", regularPrice: 90, quantity: 1, imageUrl: "" },
      ],
      "checkers" as StoreSlug
    );

    expect(result.itemCount).toBe(2);
    expect(result.unmatchedCount).toBe(1);
    expect(result.complete).toBe(false);
    // Only the matched item (~R25) contributes; the total is not R115.
    expect(result.total).toBeLessThan(30);
  });

  // An unmatched item can still carry priced suggestions (nothing scored
  // confidently enough to auto-apply) — proves compareList prices those the
  // same way it prices a confident Substitute, not just matchItem alone.
  it("prices an unmatched item's suggestions by the shopper's own quantity too", async () => {
    // Shares nothing with "Milk 2 L" by name, but is liquid like it — so it
    // clears the pack-size check and is a suggestion, not excluded outright.
    mockSearch.mockResolvedValue([product({ productId: "s1", name: "Dishwashing Liquid 1 L", regularPrice: 20 })]);

    const result = await compareList(
      [{ id: "li1", productId: "orig-1", productName: "Milk 2 L", regularPrice: 30, quantity: 2, imageUrl: "" }],
      "checkers" as StoreSlug
    );

    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item.matched).toBe(false);
    if (item.matched) throw new Error("expected no match");
    expect(item.suggestions).toHaveLength(1);
    expect(item.suggestions[0].substitute.productId).toBe("s1");
    // 2 packs of 2L at R30 = 4L need, priced at the suggestion's R20/L.
    expect(item.suggestions[0].cost).toBeCloseTo(4000 * (20 / 1000));
    // Unpicked suggestions don't count toward the server-computed total.
    expect(result.total).toBe(0);
  });

  // #91: a decision is keyed by the list item's product, so a removal made
  // for one item never reaches another item that happens to share a
  // candidate.
  it("applies a Shopper's decisions only to the product they were made for", async () => {
    mockSearch.mockImplementation(async () => [
      product({ productId: "m1", name: "Full Cream Milk 2 L", regularPrice: 25 }),
    ]);

    const result = await compareList(
      [
        { id: "li1", productId: "orig-1", productName: "Full Cream Milk 2 L", regularPrice: 30, quantity: 1, imageUrl: "" },
        { id: "li2", productId: "orig-2", productName: "Full Cream Milk 2 L", regularPrice: 30, quantity: 1, imageUrl: "" },
      ],
      "checkers" as StoreSlug,
      new Map([["orig-1", { removed: new Set(["m1"]) }]])
    );

    const [removedFor, untouched] = result.items;
    expect(removedFor.matched).toBe(false);
    if (removedFor.matched) throw new Error("expected no match");
    expect(removedFor.removed).toEqual([{ productId: "m1", name: "Full Cream Milk 2 L", imageUrl: "" }]);

    expect(untouched.matched).toBe(true);
    if (!untouched.matched) throw new Error("expected a match");
    expect(untouched.substitute.productId).toBe("m1");
    expect(untouched.chosenByShopper).toBe(false);
  });
});
