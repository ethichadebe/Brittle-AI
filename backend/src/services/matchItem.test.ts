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
    expect(result.suggestions).toEqual([]);
  });

  it("is unmatched when the list item's own name has no readable pack size", async () => {
    const noSizeItem = { productId: "orig-2", productName: "Fresh Chicken Breast Fillets", regularPrice: 89.99 };
    const search = catalogue([product({ productId: "c1", name: "Chicken Breast Fillets 1kg", regularPrice: 79.99 })]);

    const result = await matchItem(noSizeItem, "checkers", search);
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("pack size");
    expect(result.suggestions).toEqual([]);
  });

  it("is unmatched when the best candidate's own name has no readable pack size", async () => {
    const search = catalogue([product({ productId: "c1", name: "Full Cream Milk", regularPrice: 27.99 })]);

    const result = await matchItem(original, "checkers", search);
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("pack size");
    expect(result.suggestions).toEqual([]);
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
    // No suggestions either — a candidate this dimensionally incomparable
    // can't be priced, so it isn't offered as one, unlike a merely weak match.
    expect(result.suggestions).toEqual([]);
  });

  // A real report: a snack matched to a condiment purely because both names
  // share a brand ("Mrs H.S. Ball's") and the word "Chutney" — the chips'
  // own name only uses it as a flavour, but plain word-overlap can't tell
  // the difference. The target store's search also returns two chutney
  // jars in this brand line (as it would for a real "...Chutney..." query),
  // which is what lets rarity weighting recognise "mrs"/"ball's"/"chutney"
  // as common to this whole result set and no longer decisive, leaving the
  // words that actually say what the product is — "chips", "potato" — to
  // pick the real chip candidate instead.
  it("does not let a shared brand and flavour word outweigh what the product actually is", async () => {
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
    expect(result.substitute.substitute.productId).toBe("chips-willards");
  });

  // The other half of the same fix: when nothing returned is actually
  // similar, the old "best of whatever came back" rule would still auto-pick
  // one. Refusing outright once made that read as "compare doesn't work" for
  // any item where nothing scored well — so a weak top score is now offered
  // as a suggestion (something the shopper can still choose), not hidden.
  it("offers the closest candidates as suggestions, not an auto-pick, when nothing found is a strong match", async () => {
    // Same dimension as the shopper's milk (both liquid, ml) so it clears
    // the pack-size check and the low score is what refuses it — not an
    // incomparable pack size.
    const search = catalogue([
      product({ productId: "irrelevant", name: "Dishwashing Liquid 750 ml", regularPrice: 19.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason.toLowerCase()).toContain("dissimilar");
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].productId).toBe("irrelevant");
  });

  it("caps suggestions at MAX_SUGGESTIONS, best first", async () => {
    // Four candidates, all sharing only "milk" with the item — none score
    // above the confidence cutoff, so all four are suggestion candidates;
    // only the top 3 should come back.
    const search = catalogue([
      product({ productId: "c-far-1", name: "Soy Milk 1 L", regularPrice: 24.99 }),
      product({ productId: "c-close", name: "Low Fat Milk 2 L", regularPrice: 25.99 }),
      product({ productId: "c-far-2", name: "Oat Milk 1 L", regularPrice: 26.99 }),
      product({ productId: "c-far-3", name: "Almond Milk 1 L", regularPrice: 27.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0].productId).toBe("c-close");
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
