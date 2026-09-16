import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CheckersScraper,
  ShopriteScraper,
  normalise,
  parseStoreContexts,
} from "./shopriteGroup.js";

// One captured product, trimmed to the fields normalise() reads. The field names
// are the ones scripts/probe-shoprite.sh saw coming back from both sites.
const rawProduct = {
  id: 12345,
  name: "Clover Full Cream Milk 2L",
  imageProductCardURL: "https://example.com/milk.jpg",
  price: 32.99,
  bonusBuy: { discountValue: 28.99 },
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ products: [rawProduct] }));
  vi.stubGlobal("fetch", fetchMock);
  // Each test says which of these it needs.
  delete process.env.SCRAPERAPI_KEY;
  delete process.env.CHECKERS_COOKIES;
  delete process.env.SHOPRITE_COOKIES;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalise", () => {
  it("maps the store's product shape onto ours", () => {
    expect(normalise({ products: [rawProduct] })).toEqual([
      {
        productId: "12345",
        name: "Clover Full Cream Milk 2L",
        imageUrl: "https://example.com/milk.jpg",
        regularPrice: 32.99,
        loyaltyPrice: 28.99,
      },
    ]);
  });

  it("leaves loyaltyPrice null when there is no bonus buy", () => {
    // Absent, not undefined — that is how the store sends a product with no deal.
    const noBonus: Record<string, unknown> = { ...rawProduct };
    delete noBonus.bonusBuy;
    expect(normalise({ products: [noBonus] })[0].loyaltyPrice).toBeNull();
  });

  it("drops products with no id or no name rather than inventing one", () => {
    const products = [rawProduct, { ...rawProduct, id: null }, { ...rawProduct, name: "" }];
    expect(normalise({ products })).toHaveLength(1);
  });

  it("returns nothing for a body that is not a product list", () => {
    expect(normalise({ error: "blocked" })).toEqual([]);
    expect(normalise(null)).toEqual([]);
  });
});

describe("parseStoreContexts", () => {
  it("pulls the value out of a full cookie header and URL-decodes it", () => {
    const cookie = `aws-waf-token=abc; storeContexts=${encodeURIComponent('[{"storeId":"7"}]')}; other=1`;
    expect(parseStoreContexts(cookie)).toEqual([{ storeId: "7" }]);
  });

  it("gives an empty list rather than throwing when it is absent or unparseable", () => {
    expect(parseStoreContexts("")).toEqual([]);
    expect(parseStoreContexts("aws-waf-token=abc")).toEqual([]);
    expect(parseStoreContexts("storeContexts=not-json")).toEqual([]);
  });
});

describe("each site asks its own host with its own cookie", () => {
  // The whole risk of sharing one implementation is that Shoprite quietly ends up
  // asking Checkers, or pricing against a Checkers store. These two are the guard.

  it("Checkers asks checkers.co.za and reads CHECKERS_COOKIES", async () => {
    process.env.CHECKERS_COOKIES = `storeContexts=${encodeURIComponent('[{"storeId":"checkers-1"}]')}`;
    process.env.SHOPRITE_COOKIES = `storeContexts=${encodeURIComponent('[{"storeId":"shoprite-1"}]')}`;

    await new CheckersScraper().search("milk");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.checkers.co.za/api/catalogue/get-products-filter");
    expect(init.headers.Origin).toBe("https://www.checkers.co.za");
    expect(JSON.parse(init.body).storeContexts).toEqual([{ storeId: "checkers-1" }]);
  });

  it("Shoprite asks shoprite.co.za and reads SHOPRITE_COOKIES", async () => {
    process.env.CHECKERS_COOKIES = `storeContexts=${encodeURIComponent('[{"storeId":"checkers-1"}]')}`;
    process.env.SHOPRITE_COOKIES = `storeContexts=${encodeURIComponent('[{"storeId":"shoprite-1"}]')}`;

    await new ShopriteScraper().search("milk");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.shoprite.co.za/api/catalogue/get-products-filter");
    expect(init.headers.Origin).toBe("https://www.shoprite.co.za");
    expect(JSON.parse(init.body).storeContexts).toEqual([{ storeId: "shoprite-1" }]);
  });

  it("works with no cookie at all, pricing against the site's default store", async () => {
    const products = await new ShopriteScraper().search("milk");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).storeContexts).toEqual([]);
    expect(products).toHaveLength(1);
  });
});

describe("ScraperAPI routing", () => {
  it("goes through the proxy when a key is set, keeping the store URL intact", async () => {
    process.env.SCRAPERAPI_KEY = "test-key";
    process.env.SHOPRITE_COOKIES = `storeContexts=${encodeURIComponent('[{"storeId":"shoprite-1"}]')}`;

    await new ShopriteScraper().search("milk");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("api.scraperapi.com");
    expect(url).toContain(encodeURIComponent("https://www.shoprite.co.za/api/catalogue/get-products-filter"));
    // aws-waf-token is bound to the IP that solved the challenge, so forwarding
    // cookies through someone else's exit node is worse than useless.
    expect(init.headers.Cookie).toBeUndefined();
    // storeContexts still has to reach the site, so it rides in the body.
    expect(JSON.parse(init.body).storeContexts).toEqual([{ storeId: "shoprite-1" }]);
  });
});

describe("failures", () => {
  it("throws with the site's name so the log says which one broke", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" } as Response);

    await expect(new ShopriteScraper().search("milk")).rejects.toThrow("Shoprite API returned 403");
    await expect(new CheckersScraper().search("milk")).rejects.toThrow("Checkers API returned 403");
  });
});
