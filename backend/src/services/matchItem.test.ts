import { describe, it, expect } from "vitest";
import type { Product } from "@accucery/types";
import { matchItem, nameSimilarity } from "./matchItem.js";

// A canned catalogue, not a live store — #89 requires this to run with no
// network access, using the substitutable registry #74 introduced.
function catalogue(products: Product[]) {
  return async (): Promise<Product[]> => products;
}

const original = {
  productId: "orig-1",
  productName: "Clover Full Cream Milk 2 L",
  regularPrice: 29.99,
};

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

describe("matchItem", () => {
  it("matches to the best-named candidate and computes both Unit Prices", async () => {
    const search = catalogue([
      product({ productId: "unrelated", name: "White Bread 700 g", regularPrice: 19.99 }),
      product({ productId: "match-1", name: "Full Cream Milk 2 L", regularPrice: 27.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.substitute.substitute.productId).toBe("match-1");
    expect(result.substitute.original.unitPrice).toBeCloseTo(29.99 / 2000);
    expect(result.substitute.substitute.unitPrice).toBeCloseTo(27.99 / 2000);
    expect(result.substitute.original.unit).toBe("ml");
    expect(result.substitute.substitute.unit).toBe("ml");
  });

  it("is unmatched, not an error, when the target store has no candidates at all", async () => {
    const result = await matchItem(original, "checkers", catalogue([]));
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("checkers");
  });

  it("is unmatched when the list item's own name has no readable pack size", async () => {
    const noSizeItem = { productId: "orig-2", productName: "Fresh Chicken Breast Fillets", regularPrice: 89.99 };
    const search = catalogue([product({ productId: "c1", name: "Chicken Breast Fillets 1kg", regularPrice: 79.99 })]);

    const result = await matchItem(noSizeItem, "checkers", search);
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("pack size");
  });

  it("is unmatched when the best candidate's own name has no readable pack size", async () => {
    const search = catalogue([product({ productId: "c1", name: "Full Cream Milk", regularPrice: 27.99 })]);

    const result = await matchItem(original, "checkers", search);
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("pack size");
  });

  // #89's own mutation check: a candidate whose pack size is a different
  // dimension entirely (mass vs volume) must be refused, and refused by
  // name — "pack size" must appear in the reason, not just "no match".
  // Removing the unit-compatibility check would instead let this through
  // as a wrong Substitute, computing a nonsensical "price per gram vs price
  // per millilitre" comparison rather than refusing it.
  it("refuses a candidate whose pack size is a different dimension, naming pack size as why", async () => {
    const search = catalogue([
      // The only candidate is milk POWDER, sold by mass, not the liquid
      // milk by volume the shopper actually has on their list.
      product({ productId: "powder-1", name: "Full Cream Milk Powder 500 g", regularPrice: 89.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason.toLowerCase()).toContain("pack size");
    expect(result.reason).toContain("2000ml");
    expect(result.reason).toContain("500g");
  });
});

describe("nameSimilarity", () => {
  it("scores identical names as a full match", () => {
    expect(nameSimilarity("Full Cream Milk 2L", "Full Cream Milk 2L")).toBe(1);
  });

  it("scores completely unrelated names as no match", () => {
    expect(nameSimilarity("Full Cream Milk 2L", "White Bread 700g")).toBe(0);
  });

  it("ranks a closer name above a further one", () => {
    const target = "Clover Full Cream Milk 2L";
    expect(nameSimilarity(target, "Full Cream Milk 2L")).toBeGreaterThan(
      nameSimilarity(target, "Low Fat Milk 2L")
    );
  });
});
