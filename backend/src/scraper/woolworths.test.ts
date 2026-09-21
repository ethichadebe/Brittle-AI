import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  WoolworthsScraper,
  normalise,
  regularPrice,
  loyaltyPrice,
  isFood,
  zoneOrder,
} from "./woolworths.js";

// Captured from scripts/probe-woolworths-search.sh against the live site. The
// field names are the ones the probe actually saw: there is no priceValue, no
// priceConditionType and no promotionDisplayType, which is why this store does
// not reuse pnp.ts even though both are Constructor.io.
const foodItem = {
  value: "Long Life Full Cream Milk 6 x 1 L",
  data: {
    id: "20026875",
    image_url: "https://example.com/milk.jpg",
    prodtype: "Food",
    fulfiller: "Food",
    p10: 126.99,
    p30: 126.99,
    p60: 126.99,
    p10_wp: 0,
    p30_wp: 0,
    p60_wp: 0,
    promo: ["Limited: 2 items per customer", "Now R99.99 Save R27 Long Life Milk 6 x 1 L"],
    bulkpromo: [],
  },
};

// "socks" returned 439 of these, all prodtype Clothing.
const clothingItem = {
  value: "Mens Cotton Socks 3 Pack",
  data: {
    id: "50011111",
    image_url: "https://example.com/socks.jpg",
    prodtype: "Clothing",
    fulfiller: "CGM",
    p10: 199.0,
    p30: 199.0,
    p60: 199.0,
    promo: [],
  },
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    jsonResponse({ response: { results: [foodItem] } })
  );
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.WOOLWORTHS_PRICE_ZONE;
  process.env.WOOLWORTHS_SEARCH_KEY = "key_test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WOOLWORTHS_SEARCH_KEY;
  delete process.env.WOOLWORTHS_PRICE_ZONE;
});

describe("normalise", () => {
  it("maps Woolworths' product shape onto ours", () => {
    expect(normalise({ response: { results: [foodItem] } })).toEqual([
      {
        productId: "20026875",
        name: "Long Life Full Cream Milk 6 x 1 L",
        imageUrl: "https://example.com/milk.jpg",
        regularPrice: 126.99,
        loyaltyPrice: 99.99,
      },
    ]);
  });

  it("drops anything that is not food", () => {
    const out = normalise({ response: { results: [foodItem, clothingItem] } });
    expect(out.map((p) => p.name)).toEqual(["Long Life Full Cream Milk 6 x 1 L"]);
  });

  it("survives a response with no results", () => {
    expect(normalise({})).toEqual([]);
    expect(normalise({ response: {} })).toEqual([]);
  });
});

describe("isFood", () => {
  it("is the department signal, and it is case insensitive", () => {
    expect(isFood({ prodtype: "Food" })).toBe(true);
    expect(isFood({ prodtype: "food" })).toBe(true);
    expect(isFood({ prodtype: "Clothing" })).toBe(false);
    // A product with no prodtype is not assumed to be food.
    expect(isFood({})).toBe(false);
  });
});

describe("regularPrice", () => {
  // These are the real numbers from "Fresh Full Cream Ayrshire Milk 2 L", and
  // on 2026-09-21 woolworths.co.za signed out displayed R45.99 for it. So the
  // default has to resolve to p10; it used to resolve to p60 and quote R39.99,
  // which is the wrong price by R6 on every zone-varying product.
  const AYRSHIRE_MILK_2L = { p10: 45.99, p30: 39.99, p60: 39.99 };

  it("defaults to the zone an anonymous visitor is actually shown", () => {
    expect(regularPrice(AYRSHIRE_MILK_2L, zoneOrder(undefined))).toBe(45.99);
  });

  it("prefers the configured zone over the default", () => {
    expect(regularPrice(AYRSHIRE_MILK_2L, zoneOrder("p30"))).toBe(39.99);
    expect(regularPrice(AYRSHIRE_MILK_2L, zoneOrder("p60"))).toBe(39.99);
    expect(regularPrice(AYRSHIRE_MILK_2L, zoneOrder("p10"))).toBe(45.99);
  });

  it("falls through a zone the product is not sold in", () => {
    // Absent zones come back as 0, not as a missing key. Quoting that would
    // advertise a free product.
    expect(regularPrice({ p60: 0, p30: 0, p10: 24.99 })).toBe(24.99);
    expect(regularPrice({ p60: 0, p30: 0, p10: 0 })).toBe(0);
  });
});

describe("loyaltyPrice", () => {
  it("reads the promotional price out of the promo copy", () => {
    expect(loyaltyPrice(foodItem.data.promo, 126.99)).toBe(99.99);
  });

  it("ignores promo lines that are not a price", () => {
    expect(loyaltyPrice(["Limited: 2 items per customer"], 126.99)).toBeNull();
    expect(loyaltyPrice([], 126.99)).toBeNull();
    expect(loyaltyPrice(undefined, 126.99)).toBeNull();
  });

  // The whole point of parsing copy defensively: a reworded string must cost us
  // the loyalty price, never replace it with a wrong one.
  it("refuses a parsed price that is not below the regular price", () => {
    expect(loyaltyPrice(["Now R199.99 Save R0"], 126.99)).toBeNull();
    expect(loyaltyPrice(["Now R126.99"], 126.99)).toBeNull();
  });
});

describe("WoolworthsScraper", () => {
  it("refuses to run without a search key rather than guessing one", async () => {
    delete process.env.WOOLWORTHS_SEARCH_KEY;
    await expect(new WoolworthsScraper().search("milk")).rejects.toThrow(
      /WOOLWORTHS_SEARCH_KEY/
    );
  });

  it("asks Constructor.io, not Woolworths' own host", async () => {
    await new WoolworthsScraper().search("milk");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("ac.cnstrc.com/search/milk");
    expect(url).toContain("key=key_test");
  });

  // Non-food is dropped after the response arrives, so asking for exactly 20
  // would return fewer than 20 groceries on a mixed query.
  it("asks for more rows than it keeps, because it filters client-side", async () => {
    await new WoolworthsScraper().search("milk");
    expect(String(fetchMock.mock.calls[0][0])).toContain("num_results_per_page=40");
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: "Nope" } as Response);
    await expect(new WoolworthsScraper().search("milk")).rejects.toThrow(/503/);
  });
});
