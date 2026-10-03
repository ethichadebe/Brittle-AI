import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_ADDRESS, forgetDefaultStore, normalise, PnpScraper, smartShopperPrice } from "./pnp.js";

// #132: Pick n Pay priced at a real store. The product below is the shape
// the live API sent on the probe run of 2026-10-03 (#132), trimmed.
const NOW = new Date("2026-10-03T12:00:00Z");
const liveProduct = {
  available: true,
  code: "000000000000300395_EA",
  name: "PnP UHT Full Cream Milk 6 x 1L",
  price: { average: false, currencyIso: "ZAR", formattedValue: "R104.99", oldPrice: 0, priceType: "BUY", savings: 0, value: 104.99 },
  images: [
    { format: "thumbnail", imageType: "PRIMARY", url: "https://cdn-prd-02.pnp.co.za/sys-master/images/x/96Wx96H" },
    { format: "product", imageType: "PRIMARY", url: "https://cdn-prd-02.pnp.co.za/sys-master/images/x/400Wx400H" },
  ],
  potentialPromotions: [
    {
      code: "SCRIPT20260928210741-3000723467",
      endDate: "2026-10-04T21:59:59+0000",
      promotionDisplayType: "SMART_SHOPPER",
      promotionTextMessage: "R89.99 ",
      startDate: "2026-09-30T22:00:00+0000",
      valid: false,
    },
  ],
  stock: { stockLevelStatus: "inStock" },
};

describe("normalise", () => {
  it("reads the live shape: code, name, price, the larger picture, the Smart Shopper price", () => {
    expect(normalise({ products: [liveProduct] }, NOW)).toEqual([
      {
        productId: "000000000000300395_EA",
        name: "PnP UHT Full Cream Milk 6 x 1L",
        imageUrl: "https://cdn-prd-02.pnp.co.za/sys-master/images/x/400Wx400H",
        regularPrice: 104.99,
        loyaltyPrice: 89.99,
      },
    ]);
  });

  it("drops a product with no code, name or price rather than inventing one", () => {
    const products = [liveProduct, { ...liveProduct, code: "" }, { ...liveProduct, name: null }, { ...liveProduct, price: { value: 0 } }];
    expect(normalise({ products }, NOW)).toHaveLength(1);
  });

  it("is empty for a body that isn't a product list", () => {
    expect(normalise({ errors: [{ type: "ServerError" }] })).toEqual([]);
    expect(normalise(null)).toEqual([]);
  });
});

describe("the Smart Shopper price", () => {
  const promo = (over: object) => [{ ...liveProduct.potentialPromotions[0], ...over }];

  it("is read from a bare price, even though the API marks it not valid for a signed-out cart", () => {
    expect(smartShopperPrice(promo({}), NOW)).toBe(89.99);
  });

  // CONTEXT.md: a Conditional Price reduces a basket, never what one unit costs.
  it("ignores a multi-buy, which isn't what one unit costs", () => {
    expect(smartShopperPrice(promo({ promotionTextMessage: "2 for R50" }), NOW)).toBeNull();
  });

  it("ignores a promotion outside its dates", () => {
    expect(smartShopperPrice(promo({}), new Date("2026-10-05T00:00:00Z"))).toBeNull();
    expect(smartShopperPrice(promo({}), new Date("2026-09-29T00:00:00Z"))).toBeNull();
  });

  it("ignores a promotion that isn't Smart Shopper", () => {
    expect(smartShopperPrice(promo({ promotionDisplayType: "MULTIBUY" }), NOW)).toBeNull();
  });

  it("isn't a loyalty price unless it's cheaper", () => {
    const dearer = { ...liveProduct, potentialPromotions: promo({ promotionTextMessage: "R120.00" }) };
    expect(normalise({ products: [dearer] }, NOW)[0].loyaltyPrice).toBeNull();
  });
});

// A stand-in for the site: a cart at Constantia that an address moves to
// Benmore, and a search that answers whatever storeCode it's asked.
let fetchMock: ReturnType<typeof vi.fn>;
function json(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", text: async () => JSON.stringify(body) } as Response;
}
function standIn({ cartFails = false } = {}) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/users/anonymous/carts")) return cartFails ? json({}, 503) : json({ guid: "g1", baseStore: { uid: "WC21" } });
    if (u.pathname.endsWith("/addresses/delivery")) return json(null, 201);
    if (u.pathname.endsWith("/carts/g1")) return json({ baseStore: { uid: "GC13", displayName: "Pick n Pay Benmore" } });
    if (u.pathname.endsWith("/products/search")) return json({ products: [liveProduct] });
    void init;
    return json({}, 404);
  });
}
const callsTo = (end: string) => fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith(end));

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  standIn();
  forgetDefaultStore();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searching", () => {
  it("asks pnp.co.za itself, with no ScraperAPI, as the site's own anonymous requests do", async () => {
    await new PnpScraper().search("milk");

    const [url, init] = callsTo("/products/search")[0];
    expect(new URL(String(url)).origin).toBe("https://www.pnp.co.za");
    expect(init.headers).toMatchObject({ "x-pnp-cache-key": "anonymous", "x-anonymous-consents": "%5B%5D" });
  });

  it("prices at the store Sandton gets, found through the site's own cart", async () => {
    await new PnpScraper().search("milk");

    const [, address] = callsTo("/addresses/delivery")[0];
    expect(JSON.parse(String(address.body))).toMatchObject({
      latitude: DEFAULT_ADDRESS.latitude,
      longitude: DEFAULT_ADDRESS.longitude,
      streetname: "Rivonia Road",
    });
    expect(new URL(String(callsTo("/products/search")[0][0])).searchParams.get("storeCode")).toBe("GC13");
  });

  it("looks the store up once, not on every search", async () => {
    const scraper = new PnpScraper();
    await scraper.search("milk");
    await scraper.search("bread");
    await scraper.currentZone();

    expect(callsTo("/users/anonymous/carts")).toHaveLength(1);
  });

  it("a list's own store is searched without any lookup (#135)", async () => {
    await new PnpScraper().search("milk", { name: "Pick n Pay Sea Point", storeCode: "WC09" });

    expect(callsTo("/users/anonymous/carts")).toHaveLength(0);
    expect(new URL(String(callsTo("/products/search")[0][0])).searchParams.get("storeCode")).toBe("WC09");
  });

  it("tags results with the store's zone, which currentZone gives without searching", async () => {
    const scraper = new PnpScraper();
    const zone = await scraper.currentZone();
    expect(callsTo("/products/search")).toHaveLength(0);

    const [product] = await scraper.search("milk");
    expect(product.zone).toBe(zone);
    expect(zone).not.toBe("unconfigured");
    expect(zone).not.toContain("GC13");
    expect(await scraper.currentZone({ name: "Sea Point", storeCode: "WC09" })).not.toBe(zone);
  });

  it("still searches if the store can't be found, at the site's default, and says the zone is unknown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    standIn({ cartFails: true });

    const [product] = await new PnpScraper().search("milk");

    expect(new URL(String(callsTo("/products/search")[0][0])).searchParams.has("storeCode")).toBe(false);
    expect(product.zone).toBe("unconfigured");
  });

  it("throws with the store's name when the search itself fails", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      new URL(url).pathname.endsWith("/products/search") ? json({}, 503) : json({ guid: "g1", baseStore: { uid: "GC13" } })
    );
    await expect(new PnpScraper().search("milk")).rejects.toThrow("PnP API returned 503");
  });
});
