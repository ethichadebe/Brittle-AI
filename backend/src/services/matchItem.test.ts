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
  it("ranks candidates best-first and computes both Unit Prices", async () => {
    const search = catalogue([
      product({ productId: "unrelated", name: "White Bread 700 g", regularPrice: 19.99 }),
      product({ productId: "match-1", name: "Full Cream Milk 2 L", regularPrice: 27.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.substitute.candidates[0].productId).toBe("match-1");
    expect(result.substitute.original.unitPrice).toBeCloseTo(29.99 / 2000);
    expect(result.substitute.candidates[0].unitPrice).toBeCloseTo(27.99 / 2000);
    expect(result.substitute.original.unit).toBe("ml");
    expect(result.substitute.candidates[0].unit).toBe("ml");
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

  it("is unmatched when every candidate's own name has no readable pack size", async () => {
    const search = catalogue([product({ productId: "c1", name: "Full Cream Milk", regularPrice: 27.99 })]);

    const result = await matchItem(original, "checkers", search);
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("pack size");
  });

  // #89's own mutation check: a candidate whose pack size is a different
  // dimension entirely (mass vs volume) must be excluded — not merely
  // ranked lower — since there is no such thing as "a worse comparison" for
  // two incomparable dimensions, only a nonsensical one. Removing the
  // unit-compatibility check would instead let it through as a Substitute,
  // computing "price per gram vs price per millilitre" as if that meant
  // something.
  it("excludes a candidate whose pack size is a different dimension, even as one option among several", async () => {
    const search = catalogue([
      // Milk POWDER, sold by mass — not the liquid milk by volume the
      // shopper actually has on their list — alongside a real liquid-milk
      // candidate, so this proves the powder is dropped, not just outranked.
      product({ productId: "powder-1", name: "Full Cream Milk Powder 500 g", regularPrice: 89.99 }),
      product({ productId: "liquid-1", name: "Full Cream Milk 2 L", regularPrice: 27.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.substitute.candidates).toHaveLength(1);
    expect(result.substitute.candidates[0].productId).toBe("liquid-1");
  });

  it("is unmatched when the only candidate's pack size is an incomparable dimension", async () => {
    const search = catalogue([
      product({ productId: "powder-1", name: "Full Cream Milk Powder 500 g", regularPrice: 89.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason.toLowerCase()).toContain("pack size");
  });

  // A real report: a snack matched to a condiment purely because both names
  // share a brand ("Mrs H.S. Ball's") and the word "Chutney" — the chips'
  // own name only uses it as a flavour, but plain word-overlap can't tell
  // the difference. The target store's search also returns two chutney
  // jars in this brand line (as it would for a real "...Chutney..." query),
  // which is what lets rarity weighting recognise "mrs"/"ball's"/"chutney"
  // as common to this whole result set and no longer decisive, leaving the
  // words that actually say what the product is — "chips", "potato" — to
  // rank the real chip candidate first.
  it("ranks the word that says what the product is above a shared brand and flavour word", async () => {
    const chips = {
      productId: "chips-1",
      productName: "Simba Mrs H.S. Ball's Chutney Flavoured Potato Chips 120g",
      regularPrice: 24.99,
    };
    const search = catalogue([
      product({ productId: "jar-original", name: "Mrs H.S.Ball's Original Chutney 1.1 kg", regularPrice: 84.99 }),
      product({ productId: "jar-peach", name: "Mrs H.S.Ball's Peach Chutney 470 g", regularPrice: 42.99 }),
      product({
        productId: "chips-willards",
        name: "Willards Chutney Flavoured Potato Chips 125 g",
        regularPrice: 22.99,
      }),
    ]);

    const result = await matchItem(chips, "woolworths", search);

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    // All three are viable (same dimension, readable pack size), so all
    // three are offered — but the chip product, not either jar, is first.
    expect(result.substitute.candidates).toHaveLength(3);
    expect(result.substitute.candidates[0].productId).toBe("chips-willards");
  });

  // A report on the fix for the above: rejecting a weak top score outright
  // felt like "compare doesn't work" whenever nothing better existed either
  // — every item just vanished. Ranking without a score floor, and handing
  // the shopper up to MAX_CANDIDATES choices, is the actual fix: even a
  // single mediocre candidate is still surfaced (as the closest thing
  // found, not a forced pick), rather than the item disappearing outright.
  it("still surfaces the closest candidate found, even when nothing returned is a strong match", async () => {
    const search = catalogue([product({ productId: "irrelevant", name: "White Bread 2 L", regularPrice: 19.99 })]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.substitute.candidates[0].productId).toBe("irrelevant");
  });

  it("offers up to MAX_CANDIDATES options, best first, not just one", async () => {
    const search = catalogue([
      product({ productId: "c-3rd", name: "Low Fat Milk 2 L", regularPrice: 24.99 }),
      product({ productId: "c-1st", name: "Clover Full Cream Milk 2 L", regularPrice: 28.99 }),
      product({ productId: "c-2nd", name: "Full Cream Milk 2 L", regularPrice: 27.99 }),
      product({ productId: "c-4th", name: "Orange Juice 2 L", regularPrice: 22.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.substitute.candidates).toHaveLength(3);
    expect(result.substitute.candidates.map((c) => c.productId)).toEqual(["c-1st", "c-2nd", "c-3rd"]);
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
