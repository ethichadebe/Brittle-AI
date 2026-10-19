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
  imageUrl: "https://example.com/clover.jpg",
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
      product({ productId: "match-1", name: "Full Cream Milk 2 L", regularPrice: 27.99, imageUrl: "https://example.com/match.jpg" }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.substitute.substitute.productId).toBe("match-1");
    expect(result.substitute.substitute.imageUrl).toBe("https://example.com/match.jpg");
    expect(result.substitute.original.imageUrl).toBe("https://example.com/clover.jpg");
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

  // 2026-10-19 (ADR 0002 as amended, decided with the owner): where sizes
  // can't be compared, the closest names are still offered, pack for pack,
  // for the shopper to check and pick. Never applied for them.
  it("suggests, pack for pack, when the list item's own name has no readable pack size", async () => {
    const noSizeItem = { productId: "orig-2", productName: "Fresh Chicken Breast Fillets", regularPrice: 89.99, imageUrl: "" };
    const search = catalogue([product({ productId: "c1", name: "Chicken Breast Fillets 1kg", regularPrice: 79.99 })]);

    const result = await matchItem(noSizeItem, "checkers", search);
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("pack size");
    expect(result.suggestions).toEqual([expect.objectContaining({ productId: "c1", unit: "pack", unitPrice: 79.99 })]);
    expect(result.original).toEqual(expect.objectContaining({ unit: "pack", unitPrice: 89.99 }));
  });

  it("suggests, pack for pack, when the best candidate's own name has no readable pack size", async () => {
    const search = catalogue([product({ productId: "c1", name: "Full Cream Milk", regularPrice: 27.99 })]);

    const result = await matchItem(original, "checkers", search);
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("pack size");
    expect(result.suggestions).toEqual([expect.objectContaining({ productId: "c1", unit: "pack", unitPrice: 27.99 })]);
  });

  // The owner's report: Woolworths' whole chicken "Avg 1.3 kg" at Pick n Pay,
  // whose whole chicken is sold by weight with no size in its name.
  it("offers a product sold by weight, but not one that shares no word with the item", async () => {
    const chicken = { productId: "w-chicken", productName: "Free Range Whole Chicken Avg 1.3 kg", regularPrice: 92.39, imageUrl: "" };
    const search = catalogue([
      product({ productId: "pnp-chicken", name: "PnP Whole Chicken", regularPrice: 127.69 }),
      product({ productId: "bread", name: "White Bread", regularPrice: 17.99 }),
    ]);

    const result = await matchItem(chicken, "pick-n-pay", search);
    if (result.matched) throw new Error("expected no match");
    expect(result.suggestions.map((s) => s.productId)).toEqual(["pnp-chicken"]);
  });

  // #89's own mutation check: a candidate whose pack size is a different
  // dimension entirely (mass vs volume) must never be applied as a
  // Substitute, and the reason must name pack size. Removing the
  // unit-compatibility check would instead apply it, with a nonsensical
  // "price per gram vs price per millilitre" comparison. Since 2026-10-19 it
  // is offered pack for pack, for the shopper to judge.
  it("never applies a candidate whose pack size is a different dimension, naming pack size as why", async () => {
    const search = catalogue([
      // The only candidate is milk POWDER, sold by mass, not the liquid
      // milk by volume the shopper actually has on their list.
      product({ productId: "powder-1", name: "Full Cream Milk Powder 500 g", regularPrice: 89.99 }),
    ]);

    const result = await matchItem(original, "checkers", search);

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason.toLowerCase()).toContain("pack size");
    expect(result.suggestions).toEqual([expect.objectContaining({ productId: "powder-1", unit: "pack" })]);
  });

  it("matches eggs by count, per egg", async () => {
    const eggs = { productId: "w-eggs", productName: "Free Range Extra Large Chilled Eggs 18 pk", regularPrice: 109.99, imageUrl: "" };
    const search = catalogue([
      product({ productId: "large", name: "PnP Live Well Free Range Large Eggs 18 Pack", regularPrice: 69.99 }),
      product({ productId: "xl", name: "PnP Live Well Free Range Extra Large Eggs 18 Pack", regularPrice: 79.99 }),
      product({ productId: "six", name: "PnP Live Well Extra Large Free Range Eggs 6 Pack", regularPrice: 27.99 }),
    ]);

    const result = await matchItem(eggs, "pick-n-pay", search);
    if (!result.matched) throw new Error(`expected a match: ${result.reason}`);
    expect(result.substitute.substitute).toEqual(expect.objectContaining({ productId: "xl", unit: "each" }));
    expect(result.substitute.substitute.unitPrice).toBeCloseTo(79.99 / 18);
    expect(result.substitute.original.unitPrice).toBeCloseTo(109.99 / 18);
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
      imageUrl: "",
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

// #91: a Shopper's remembered decisions. The catalogue answers per query so
// a test can tell a search for the remembered pick's own name from a
// search for the list item.
function catalogueByQuery(byQuery: Record<string, Product[]>) {
  const queries: string[] = [];
  const search = async (_store: string, query: string): Promise<Product[]> => {
    queries.push(query);
    return byQuery[query] ?? [];
  };
  return { search, queries };
}

const chips = {
  productId: "chips-1",
  productName: "Simba Mrs H.S. Ball's Chutney Flavoured Potato Chips 120g",
  regularPrice: 24.99,
  imageUrl: "",
};

describe("matchItem with a Shopper's decisions", () => {
  it("applies a remembered pick by searching for it by name, even one that would not clear the cutoff", async () => {
    // "Dishwashing Liquid" shares nothing with milk by name — it would never
    // be auto-applied — but the Shopper picked it, so it is.
    const { search, queries } = catalogueByQuery({
      "Dishwashing Liquid 750 ml": [product({ productId: "picked", name: "Dishwashing Liquid 750 ml", regularPrice: 19.99 })],
    });

    const result = await matchItem(original, "checkers", search, {
      chosen: { productId: "picked", name: "Dishwashing Liquid 750 ml" },
    });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.source).toBe("shopper");
    expect(result.substitute.substitute.productId).toBe("picked");
    expect(result.substitute.substitute.unitPrice).toBeCloseTo(19.99 / 750);
    // One search, for the pick itself — not an extra one for the list item.
    expect(queries).toEqual(["Dishwashing Liquid 750 ml"]);
  });

  it("falls back to ordinary matching when the remembered pick is no longer sold", async () => {
    const { search, queries } = catalogueByQuery({
      "Gone Milk 2 L": [product({ productId: "something-else", name: "Gone Milk 2 L", regularPrice: 20 })],
      [original.productName]: [product({ productId: "match-1", name: "Full Cream Milk 2 L", regularPrice: 27.99 })],
    });

    const result = await matchItem(original, "checkers", search, {
      chosen: { productId: "gone", name: "Gone Milk 2 L" },
    });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.source).toBe("accucery");
    expect(result.substitute.substitute.productId).toBe("match-1");
    expect(queries).toEqual(["Gone Milk 2 L", original.productName]);
  });

  it("falls back when the remembered pick is no longer comparable by pack size", async () => {
    const { search } = catalogueByQuery({
      "Milk Powder": [product({ productId: "picked", name: "Full Cream Milk Powder 500 g", regularPrice: 89.99 })],
      [original.productName]: [product({ productId: "match-1", name: "Full Cream Milk 2 L", regularPrice: 27.99 })],
    });

    const result = await matchItem(original, "checkers", search, {
      chosen: { productId: "picked", name: "Milk Powder" },
    });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.source).toBe("accucery");
    expect(result.substitute.substitute.productId).toBe("match-1");
  });

  it("never applies a removed product, even the one that would have won", async () => {
    const { search } = catalogueByQuery({
      [chips.productName]: [
        product({ productId: "chips-willards", name: "Willards Chutney Flavoured Potato Chips 125 g", regularPrice: 22.99 }),
        product({ productId: "chips-lays", name: "Lays Chutney Flavoured Potato Chips 120 g", regularPrice: 21.99 }),
      ],
    });

    const result = await matchItem(chips, "woolworths", search, { removed: new Set(["chips-willards"]) });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.substitute.substitute.productId).toBe("chips-lays");
  });

  it("never suggests a removed product either", async () => {
    const { search } = catalogueByQuery({
      [original.productName]: [
        product({ productId: "soap", name: "Dishwashing Liquid 750 ml", regularPrice: 19.99 }),
        product({ productId: "juice", name: "Orange Juice 2 L", regularPrice: 29.99 }),
      ],
    });

    const result = await matchItem(original, "checkers", search, { removed: new Set(["soap"]) });

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.suggestions.map((s) => s.productId)).toEqual(["juice"]);
    expect(result.removed).toEqual([{ productId: "soap", name: "Dishwashing Liquid 750 ml", imageUrl: "" }]);
  });

  it("shows the item as not found, naming what was removed, when the removal left nothing", async () => {
    const { search } = catalogueByQuery({
      [original.productName]: [product({ productId: "match-1", name: "Full Cream Milk 2 L", regularPrice: 27.99 })],
    });

    const result = await matchItem(original, "checkers", search, { removed: new Set(["match-1"]) });

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).toContain("removed by the shopper");
    expect(result.suggestions).toEqual([]);
    expect(result.removed).toEqual([{ productId: "match-1", name: "Full Cream Milk 2 L", imageUrl: "" }]);
  });

  it("does not claim a removal when the store simply has nothing", async () => {
    const { search } = catalogueByQuery({});

    const result = await matchItem(original, "checkers", search, { removed: new Set(["match-1"]) });

    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("expected no match");
    expect(result.reason).not.toContain("removed");
    expect(result.removed).toEqual([]);
  });
});

// #103: a Popular Substitute is what enough other Shoppers chose. It
// outranks Accucery's own guess, but never the Shopper's own decision.
describe("matchItem where sizes can't be compared, with decisions", () => {
  const chicken = { productId: "w-chicken", productName: "Free Range Whole Chicken Avg 1.3 kg", regularPrice: 92.39, imageUrl: "" };
  const search = catalogue([product({ productId: "pnp-chicken", name: "PnP Whole Chicken", regularPrice: 127.69 })]);

  it("keeps the shopper's own pick applied, pack for pack", async () => {
    const result = await matchItem(chicken, "pick-n-pay", search, { chosen: { productId: "pnp-chicken", name: "PnP Whole Chicken" } });
    if (!result.matched) throw new Error(`expected a match: ${result.reason}`);
    expect(result.source).toBe("shopper");
    expect(result.substitute.substitute).toEqual(expect.objectContaining({ productId: "pnp-chicken", unit: "pack", unitPrice: 127.69 }));
    expect(result.substitute.original).toEqual(expect.objectContaining({ unit: "pack", unitPrice: 92.39 }));
  });

  it("keeps it applied when the list item's own size can't be read either", async () => {
    const noSize = { productId: "w-fillets", productName: "Fresh Chicken Breast Fillets", regularPrice: 89.99, imageUrl: "" };
    const result = await matchItem(noSize, "pick-n-pay", search, { chosen: { productId: "pnp-chicken", name: "PnP Whole Chicken" } });
    if (!result.matched) throw new Error(`expected a match: ${result.reason}`);
    expect(result.substitute.substitute.productId).toBe("pnp-chicken");
  });

  it("never applies someone else's choice pack for pack: a Popular Substitute stays a suggestion", async () => {
    const result = await matchItem(chicken, "pick-n-pay", search, { popular: { productId: "pnp-chicken", name: "PnP Whole Chicken" } });
    expect(result.matched).toBe(false);
  });
});

describe("matchItem with a Popular Substitute", () => {
  const soap = product({ productId: "popular", name: "Dishwashing Liquid 750 ml", regularPrice: 19.99 });
  const liquidMilk = product({ productId: "match-1", name: "Full Cream Milk 2 L", regularPrice: 27.99 });

  it("applies it, marked popular, even where Accucery's own match would win", async () => {
    const { search } = catalogueByQuery({
      [soap.name]: [soap],
      [original.productName]: [liquidMilk],
    });

    const result = await matchItem(original, "checkers", search, { popular: { productId: "popular", name: soap.name } });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.source).toBe("popular");
    expect(result.substitute.substitute.productId).toBe("popular");
  });

  it("is outranked by the Shopper's own pick", async () => {
    const { search } = catalogueByQuery({
      [soap.name]: [soap],
      [liquidMilk.name]: [liquidMilk],
    });

    const result = await matchItem(original, "checkers", search, {
      chosen: { productId: "match-1", name: liquidMilk.name },
      popular: { productId: "popular", name: soap.name },
    });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.source).toBe("shopper");
    expect(result.substitute.substitute.productId).toBe("match-1");
  });

  it("is never applied for a Shopper who removed it", async () => {
    const { search, queries } = catalogueByQuery({
      [soap.name]: [soap],
      [original.productName]: [liquidMilk, soap],
    });

    const result = await matchItem(original, "checkers", search, {
      removed: new Set(["popular"]),
      popular: { productId: "popular", name: soap.name },
    });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.source).toBe("accucery");
    expect(result.substitute.substitute.productId).toBe("match-1");
    expect(queries).not.toContain(soap.name);
  });

  it("falls back to ordinary matching when the popular product is no longer sold", async () => {
    const { search } = catalogueByQuery({ [original.productName]: [liquidMilk] });

    const result = await matchItem(original, "checkers", search, { popular: { productId: "popular", name: soap.name } });

    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error("expected a match");
    expect(result.source).toBe("accucery");
  });
});
