import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MakroScraper,
  normalise,
  collectProducts,
  effectivePrice,
  titleOf,
  balancedSlice,
} from "./makro.js";

// Captured from scripts/probe-makro.sh against the live site. The live page
// showed exactly this pricing block on a Parmalat long-life milk.
const pricing = {
  currency: "INR", // Flipkart's platform is not localised; prices are rands.
  discountAmount: 11400, // cents
  totalDiscount: 34, // percent
  deliveryCharge: { priceType: "DELIVERY_CHARGE", value: 0, name: "Delivery Charge" },
  finalPrice: { name: "Total", priceType: "TOTAL", value: 215 },
  mrp: { name: "Maximum Retail Price", priceType: "MRP", value: 329 },
  prices: [
    { name: "Selling Price", priceType: "FSP", value: 329 },
    { name: "Special Price", priceType: "SPECIAL_PRICE", value: 215 },
  ],
};

// renderableComponents: the title sits directly on the object.
const shapeA = {
  value: {
    type: "RichProductValue",
    title: "Parmalat Everfresh Full Cream Milk 6 x 1L",
    imageUrl: "https://www.makro.co.za/parmalat.jpg",
    itemId: "ITM40ECCC8072E",
    productId: "MLKHFXJTMMYEPC",
    pricing,
  },
};

// The products widget: the title is nested at titles.title. Accepting only the
// first shape found 5 products on a page that had 45.
const shapeB = {
  productInfo: {
    value: {
      titles: { title: "Clover Full Cream Long Life Milk 1L" },
      imageUrl: "https://www.makro.co.za/clover.jpg",
      productId: "CLVR00001",
      pricing: {
        prices: [{ name: "Selling Price", priceType: "FSP", value: 109.95 }],
        mrp: { priceType: "MRP", value: 119.95 },
      },
    },
  },
};

function pageWith(state: unknown): string {
  return `<html><body><script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script></body></html>`;
}

const livePage = pageWith({
  pageDataV4: {
    page: { data: { ROOT: [{ widget: { data: { renderableComponents: [shapeA] } } }] } },
  },
  other: { deep: { nest: { widget: { data: { products: [shapeB] } } } } },
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => livePage,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("balancedSlice", () => {
  it("stops at the matching brace, not the first one inside a string", () => {
    const html = `x = {"a":"}","b":1}; tail`;
    expect(balancedSlice(html, 4)).toBe('{"a":"}","b":1}');
  });

  it("returns null when the object never closes", () => {
    expect(balancedSlice('{"a":1', 0)).toBeNull();
  });
});

describe("titleOf", () => {
  it("accepts both widget shapes", () => {
    expect(titleOf({ title: "Direct" })).toBe("Direct");
    expect(titleOf({ titles: { title: "Nested" } })).toBe("Nested");
    expect(titleOf({})).toBe("");
  });
});

describe("effectivePrice", () => {
  // What the shopper pays. SPECIAL_PRICE is a public promotion at Makro, not a
  // card-gated one, so it is the price - not a loyalty price.
  it("prefers the special price over the selling price", () => {
    expect(effectivePrice(pricing)).toBe(215);
  });

  it("falls back to the selling price, then the MRP", () => {
    expect(effectivePrice({ prices: [{ priceType: "FSP", value: 99 }] })).toBe(99);
    expect(effectivePrice({ mrp: { value: 49 } })).toBe(49);
    expect(effectivePrice({})).toBe(0);
  });

  // finalPrice is named "Total" with priceType TOTAL and sits beside a delivery
  // charge, so it may include delivery on some products. Never read it.
  it("ignores finalPrice even when it is the only thing that looks like a total", () => {
    expect(effectivePrice({ finalPrice: { priceType: "TOTAL", value: 12345 } })).toBe(0);
  });
});

describe("collectProducts", () => {
  it("finds products by shape, at any depth, in either widget", () => {
    const products = normalise(livePage);
    expect(products.map((p) => p.name)).toEqual([
      "Parmalat Everfresh Full Cream Milk 6 x 1L",
      "Clover Full Cream Long Life Milk 1L",
    ]);
  });

  it("maps the live fields onto ours", () => {
    expect(normalise(livePage)[0]).toEqual({
      productId: "MLKHFXJTMMYEPC",
      name: "Parmalat Everfresh Full Cream Milk 6 x 1L",
      imageUrl: "https://www.makro.co.za/parmalat.jpg",
      regularPrice: 215,
      loyaltyPrice: null,
    });
  });

  // Makro has no loyalty programme, so claiming one would show a saving the
  // shopper cannot get and could change the basket total.
  it("never reports a loyalty price", () => {
    expect(normalise(livePage).every((p) => p.loyaltyPrice === null)).toBe(true);
  });

  it("drops anything without a readable price rather than showing zero", () => {
    const page = pageWith({ w: [{ productId: "X1", title: "No price", pricing: {} }] });
    expect(normalise(page)).toEqual([]);
  });

  it("ignores objects that are not products", () => {
    const page = pageWith({ banner: { title: "Milk deals", productId: "AD1" } });
    expect(normalise(page)).toEqual([]);
  });

  it("de-duplicates a product reachable by more than one route", () => {
    const blob = { a: [shapeA], b: { c: [shapeA] } };
    expect(collectProducts(blob)).toHaveLength(1);
  });

  it("survives a page with no embedded state", () => {
    expect(normalise("<html><body>nothing here</body></html>")).toEqual([]);
  });

  it("survives a marker whose JSON does not parse", () => {
    expect(normalise("<script>window.__INITIAL_STATE__ = {broken;</script>")).toEqual([]);
  });
});

describe("MakroScraper", () => {
  it("asks makro.co.za directly, spending no ScraperAPI credits", async () => {
    await new MakroScraper().search("milk");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("https://www.makro.co.za/search?q=milk");
    expect(url).not.toContain("scraperapi");
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: "Nope" } as Response);
    await expect(new MakroScraper().search("milk")).rejects.toThrow(/503/);
  });
});
