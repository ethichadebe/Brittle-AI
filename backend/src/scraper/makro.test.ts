import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MakroScraper, normalise, collectProducts, effectivePrice, titleOf, balancedSlice, imageOf, fillImageTemplate } from "./makro.js";

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

// The URL shape scripts/probe-makro-images.sh printed from the live page, kept
// verbatim rather than tidied: 88 of these were seen on www.makro.co.za, and
// every one carried the braces.
const LIVE_TEMPLATE =
  "https://www.makro.co.za/asset/rukmini/fccp/{@width}/{@height}/" +
  "ng-fkpublic-ui-user-fbbe/container/j/u/s/box-1-rolling-egg-storage-" +
  "containers-top-original-imagxyz.jpeg?q={@quality}";

describe("imageOf", () => {
  it("reads media.images, the shape the live page uses", () => {
    const url = imageOf({ media: { images: [{ url: LIVE_TEMPLATE }] } });
    expect(url).toContain("/asset/rukmini/fccp/416/416/");
  });

  it("leaves no placeholder behind, whatever its name", () => {
    const url = imageOf({
      media: { images: [{ url: "https://www.makro.co.za/a/{@width}/{@unknown}/b.jpg" }] },
    });
    // A literal brace in a URL is a guaranteed 404, so none may survive.
    expect(url).not.toContain("{@");
    expect(url).not.toContain("}");
  });

  it("substitutes quality as well as size", () => {
    expect(fillImageTemplate(LIVE_TEMPLATE)).toBe(
      "https://www.makro.co.za/asset/rukmini/fccp/416/416/" +
        "ng-fkpublic-ui-user-fbbe/container/j/u/s/box-1-rolling-egg-storage-" +
        "containers-top-original-imagxyz.jpeg?q=70",
    );
  });

  it("keeps the host, so the image proxy still allows it", () => {
    expect(new URL(imageOf({ media: { images: [{ url: LIVE_TEMPLATE }] } })).hostname)
      .toBe("www.makro.co.za");
  });

  it("skips an entry with no url and takes the next", () => {
    const url = imageOf({
      media: { images: [{ kind: "PRIMARY" }, { url: "https://www.makro.co.za/b.jpg" }] },
    });
    expect(url).toBe("https://www.makro.co.za/b.jpg");
  });

  it("falls back to a plain imageUrl", () => {
    expect(imageOf({ imageUrl: "https://www.makro.co.za/c.jpg" }))
      .toBe("https://www.makro.co.za/c.jpg");
  });

  it("prefers media.images over imageUrl when both are present", () => {
    const url = imageOf({
      imageUrl: "https://www.makro.co.za/old.jpg",
      media: { images: [{ url: "https://www.makro.co.za/new.jpg" }] },
    });
    expect(url).toBe("https://www.makro.co.za/new.jpg");
  });

  it("returns empty when there is no image at all", () => {
    expect(imageOf({ productId: "X", title: "Eggs" })).toBe("");
    expect(imageOf({ media: { images: [] } })).toBe("");
    expect(imageOf(null)).toBe("");
  });
});

// The unit tests above all passed while collectProducts still read the dead
// node.imageUrl field, because none of them exercised the wiring. That is the
// same gap that shipped the bug: the helper was never the problem, what read it
// was. This asserts the path a real page takes.
describe("collectProducts wires the image through", () => {
  it("fills imageUrl from media.images, substituted", () => {
    const [product] = collectProducts({
      widgets: [
        {
          productInfo: {
            value: {
              productId: "EGG001",
              titles: { title: "Eggs Large 18s" },
              pricing: { prices: [{ priceType: "FSP", value: 54.99 }] },
              media: { images: [{ url: LIVE_TEMPLATE }] },
            },
          },
        },
      ],
    });
    expect(product.imageUrl).toContain("/asset/rukmini/fccp/416/416/");
    expect(product.imageUrl).not.toContain("{@");
  });

  it("leaves imageUrl empty rather than broken when a product has no image", () => {
    const [product] = collectProducts({
      value: {
        productId: "EGG002",
        title: "Eggs Jumbo 6s",
        pricing: { prices: [{ priceType: "FSP", value: 29.99 }] },
      },
    });
    expect(product.imageUrl).toBe("");
  });
});
