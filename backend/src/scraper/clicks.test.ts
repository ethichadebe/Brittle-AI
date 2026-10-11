import { describe, it, expect } from "vitest";
import { ClicksScraper, algoliaCredentials, imageUrlOf, normalise, prices, productIndex } from "./clicks.js";

// The promotion wording below is copied from Clicks' Algolia index on
// 2026-10-11, "~id~TYPE" suffix and all. The keys are invented.
const OLD_KEY = "0123456789abcdef0123456789abcdef"; // gitleaks:allow — invented test value, not a real key
const LIVE_KEY = "fedcba9876543210fedcba9876543210"; // gitleaks:allow — invented test value, not a real key
const APP = "TESTAPP123";

// As webpack ships it: inside an eval string, line breaks written out as
// \r\n, and the retired key still there in a comment ahead of the live one.
const BUNDLE = String.raw`eval("\r\n//const client = algoliasearchNew('${APP}', '${OLD_KEY}');\r\nconst algoliaClient = algoliasearch_lite__WEBPACK_IMPORTED_MODULE_0___default()(\r\n\t\t  '${APP}',\r\n\t\t  '${LIVE_KEY}'\r\n);");`;
const HOME = '<input type="hidden" value="Test_ProductIndex" id="algoliaProductIndex">';

describe("reading Clicks' Algolia settings from its own pages", () => {
  it("finds every key in the bundle, in order, the commented one too", () => {
    expect(algoliaCredentials(BUNDLE)).toEqual([
      { app: APP, key: OLD_KEY },
      { app: APP, key: LIVE_KEY },
    ]);
  });

  it("finds nothing in a bundle without a key", () => {
    expect(algoliaCredentials("console.log('hello')")).toEqual([]);
  });

  it("reads the index the page names, or falls back to the one it named", () => {
    expect(productIndex(HOME)).toBe("Test_ProductIndex");
    expect(productIndex("<html></html>")).toBe("Prod_ProductIndex");
  });
});

describe("what a Clicks product costs", () => {
  const NEW_LOWER =
    "New lower prices. ClubCard customers instantly get 10% off. Valid until 21 October 2026~202610080529481000~GENERIC";

  it("is the shelf price when nothing is on promotion", () => {
    expect(prices(29.99, null, [])).toEqual({ regularPrice: 29.99, loyaltyPrice: null });
  });

  it("takes a plain new price for everyone", () => {
    expect(
      prices(339, 189.99, ["Huggies Extra Care Disposable Nappies Value Pack Size 1 and 2, Now 189.99 per pack. Valid until 21 October 2026~2026090920~FIXEDPRICE"])
    ).toEqual({ regularPrice: 189.99, loyaltyPrice: null });
  });

  it("prices one item of a multi-buy at its single price, not Algolia's per-pack figure", () => {
    expect(
      prices(179, 130, ["Clicks Made 4 Baby Dry Protect Disposable Nappies Value Pack, Buy 2 for 130 per pack Or 1 for 169 per pack. Valid until 21 October 2026~2026~GENERIC"])
    ).toEqual({ regularPrice: 169, loyaltyPrice: null });
  });

  it("leaves the price alone for a multi-buy that doesn't price one", () => {
    for (const text of [
      "Buy any 3 Smartbite Foods Teas, cheapest one free. Valid until 21 October 2026~2026~GENERIC",
      "Elvive Shampoo or Conditioner 300ml, 400ml , Save 72 Per Offer, 2 For 170. Valid until 21 October 2026~2026~GENERIC",
      "3F2 AFRI TRUE NATURALS&LEGACY haircare. Valid until 21 October 2026~2026~GENERIC",
    ]) {
      expect(prices(120, 85, [text])).toEqual({ regularPrice: 120, loyaltyPrice: null });
    }
  });

  it("makes a ClubCard-only deal the loyalty price, not the shelf price", () => {
    expect(
      prices(338, 199.99, ["Clubcard Members Only, Huggies Gold Skin Soft Pants or Disposable Nappies Jumbo Pack, Now 199.99 per pack.. Clubcard~2026~FIXEDPRICE"])
    ).toEqual({ regularPrice: 338, loyaltyPrice: 199.99 });
  });

  it("takes ClubCard's 10% off the shelf price", () => {
    expect(prices(44.99, 44.99, [NEW_LOWER])).toEqual({ regularPrice: 44.99, loyaltyPrice: 40.49 });
  });

  it("doesn't stack ClubCard's 10% on another promotion", () => {
    expect(
      prices(199, 185, [
        "Clicks Made 4 Baby Dryprotect Disposable Nappies Jumbo Pack, Buy 2 for 165 per pack Or 1 for 185 per pack. Valid until 21 October 2026~2026~GENERIC",
        NEW_LOWER,
      ])
    ).toEqual({ regularPrice: 185, loyaltyPrice: null });
  });

  it("uses Algolia's number for a public promotion that gives none in words, rounded to cents", () => {
    expect(prices(179.95, 125.965, ["Save 30% on Revlon Lips. Valid until 21 October 2026~2026~FIXEDPERCENTAGE"])).toEqual({
      regularPrice: 125.97,
      loyaltyPrice: null,
    });
  });

  it("doesn't trust Algolia's number when something on the product is ClubCard-only", () => {
    expect(
      prices(100, 70, ["20% Off selected haircare~2026~FIXEDPERCENTAGE", "Clubcard Members Only, Now 70.~2026~FIXEDPRICE"])
    ).toEqual({ regularPrice: 100, loyaltyPrice: 70 });
  });

  it("ignores an online-only price, which a store's shelf doesn't charge", () => {
    expect(prices(879, 610, ["Save On Selected Kambrook Products Online Only. Valid until 21 October 2026~2026~FIXEDPRICE"])).toEqual({
      regularPrice: 879,
      loyaltyPrice: null,
    });
  });

  it("ignores a 'promotion' above the shelf price", () => {
    expect(prices(50, 60, ["Now 60.~2026~FIXEDPRICE"])).toEqual({ regularPrice: 50, loyaltyPrice: null });
    expect(prices(50, null, ["Clubcard Members Only, Now 55.~2026~FIXEDPRICE"])).toEqual({ regularPrice: 50, loyaltyPrice: null });
  });

  it("reads only the wording, not the id and type Clicks appends", () => {
    expect(prices(79.99, 76.99, ["Clicks Made 4 Baby Wipes 240s, Now 76.99. Valid until 21 October 2026~202609232030191016~FIXEDPRICE"]).regularPrice).toBe(76.99);
    // The suffix is ids and a type; read as wording, "3 for 2" here would
    // make a plain promotion look like a multi-buy.
    expect(prices(80, 60, ["Save on selected~3 for 2~GENERIC"]).regularPrice).toBe(60);
  });
});

describe("normalise", () => {
  const hit = (over: Record<string, unknown> = {}) => ({
    objectID: "221272",
    baseProductCode: "221272",
    brandName: "Aquafresh",
    productName: "Fluoride Toothpaste Twin Pack",
    brandWithProductName: "Aquafresh  Fluoride Toothpaste Twin Pack",
    price: "44.99",
    promoWithAppliedGrossPriceValue: "44.99",
    img300Wx300H: "/medias/?context=abc",
    ...over,
  });

  it("reads a hit as a product, with the image made absolute", () => {
    expect(normalise({ hits: [hit()] })).toEqual([
      {
        productId: "221272",
        name: "Aquafresh Fluoride Toothpaste Twin Pack",
        imageUrl: "https://clicks.co.za/medias/?context=abc",
        zone: "none",
        regularPrice: 44.99,
        loyaltyPrice: null,
      },
    ]);
  });

  it("builds the name from brand and product when the combined one is missing", () => {
    expect(normalise({ hits: [hit({ brandWithProductName: "" })] })[0].name).toBe("Aquafresh Fluoride Toothpaste Twin Pack");
  });

  it("drops a hit without a usable price, and repeats", () => {
    const out = normalise({ hits: [hit({ price: "" }), hit({ objectID: "2", price: 0 }), hit({ objectID: "3" }), hit({ objectID: "3" })] });
    expect(out.map((p) => p.productId)).toEqual(["3"]);
  });

  it("keeps at most 20, like the other stores", () => {
    expect(normalise({ hits: Array.from({ length: 30 }, (_, i) => hit({ objectID: String(i) })) })).toHaveLength(20);
  });

  it("survives a body that isn't the expected shape", () => {
    expect(normalise(null)).toEqual([]);
    expect(normalise({ hits: "no" })).toEqual([]);
  });

  it("only makes Clicks' own paths absolute", () => {
    expect(imageUrlOf("https://clicks.co.za/x.jpg")).toBe("https://clicks.co.za/x.jpg");
    expect(imageUrlOf("medias/x.jpg")).toBe("");
    expect(imageUrlOf(undefined)).toBe("");
  });
});

// A stand-in for clicks.co.za and Algolia: Algolia accepts only `liveKey`.
function site({ liveKey = LIVE_KEY, bundle = BUNDLE, algoliaStatus = 200 } = {}) {
  const calls: { url: string; key?: string; body?: string }[] = [];
  const state = { liveKey, bundle, algoliaStatus };
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, key: headers["X-Algolia-API-Key"], body: init?.body as string | undefined });
    if (url === "https://clicks.co.za/") return new Response(HOME);
    if (url.endsWith("/algoliaCombined.js")) return new Response(state.bundle);
    if (url.includes(".algolia.net/")) {
      if (headers["X-Algolia-API-Key"] !== state.liveKey) return new Response('{"message":"Invalid API key"}', { status: 403 });
      if (state.algoliaStatus !== 200) return new Response("{}", { status: state.algoliaStatus });
      return Response.json({ hits: [{ objectID: "1", brandWithProductName: "Colgate Toothpaste", price: 26.99 }] });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { impl, calls, state };
}

describe("ClicksScraper", () => {
  it("finds the live key past the retired one, and searches the index the page names", async () => {
    const { impl, calls } = site();
    const products = await new ClicksScraper(impl).search("tooth paste");

    expect(products.map((p) => p.name)).toEqual(["Colgate Toothpaste"]);
    const algolia = calls.filter((c) => c.url.includes("algolia.net"));
    expect(algolia.map((c) => c.key)).toEqual([OLD_KEY, LIVE_KEY]);
    expect(algolia[1].url).toBe(`https://${APP}-dsn.algolia.net/1/indexes/Test_ProductIndex/query`);
    expect(JSON.parse(algolia[1].body ?? "{}").params).toBe("query=tooth%20paste&hitsPerPage=20");
  });

  it("remembers the key that worked: the next search is one request", async () => {
    const { impl, calls } = site();
    const scraper = new ClicksScraper(impl);
    await scraper.search("milk");
    const before = calls.length;

    await scraper.search("bread");

    expect(calls.slice(before).map((c) => c.key)).toEqual([LIVE_KEY]);
  });

  it("reads the bundle again once when Clicks rotates its key", async () => {
    const NEW_KEY = "aaaabbbbccccddddeeeeffff00001111"; // gitleaks:allow — invented test value, not a real key
    const { impl, calls, state } = site();
    const scraper = new ClicksScraper(impl);
    await scraper.search("milk");

    state.liveKey = NEW_KEY;
    state.bundle = BUNDLE.replace(LIVE_KEY, NEW_KEY);
    const before = calls.length;
    const products = await scraper.search("bread");

    expect(products).toHaveLength(1);
    expect(calls.slice(before).filter((c) => c.url.endsWith("/algoliaCombined.js"))).toHaveLength(1);
  });

  it("gives up after that one retry when no key works", async () => {
    const { impl, calls } = site({ liveKey: "nothing-matches" });
    await expect(new ClicksScraper(impl).search("milk")).rejects.toThrow(/refused every key \(403\)/);
    expect(calls.filter((c) => c.url.endsWith("/algoliaCombined.js"))).toHaveLength(2);
  });

  it("fails plainly when the bundle has no key", async () => {
    const { impl } = site({ bundle: "nothing here" });
    await expect(new ClicksScraper(impl).search("milk")).rejects.toThrow(/no Algolia key/);
  });

  it("doesn't blame the key for an Algolia outage", async () => {
    const { impl, calls } = site({ algoliaStatus: 500 });
    await expect(new ClicksScraper(impl).search("milk")).rejects.toThrow(/returned 500/);
    expect(calls.filter((c) => c.url.endsWith("/algoliaCombined.js"))).toHaveLength(1);
  });

  it("has one national price", () => {
    expect(new ClicksScraper(site().impl).currentZone()).toBe("none");
  });
});
