import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CheckersScraper,
  ShopriteScraper,
  BRANCH_TTL_MS,
  DEFAULT_PLACE,
  NEAREST_TRIES,
  SHOPRITE_SITE,
  forgetBranches,
  normalise,
  type StoreContext,
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

// A stand-in for one site's three endpoints, shaped like the replies
// scripts/probe-location-prices.mjs recorded (#66). `own` is what the site
// names for the default place; `nearby` its store finder's answer, nearest
// first; `at` what it names for each nearby store's own coordinates.
interface SiteStandIn {
  own?: StoreContext[];
  nearby?: { name: string; coordinates?: { latitude: number; longitude: number } }[];
  at?: Record<string, StoreContext[]>;
  products?: unknown[];
  lookupFails?: boolean;
  /** Stores that name a delivering service but sell nothing (Milnerton, #66). */
  emptyAt?: string[];
}

const JHB: StoreContext[] = [
  { storeId: "store-jhb-1", serviceOptionIds: ["sixty-min-delivery"], hasCapacity: ["sixty-min-delivery"] },
  { storeId: "store-jhb-2", serviceOptionIds: ["one-day-delivery"], hasCapacity: [] },
];
const DIGITAL: StoreContext[] = [{ storeId: "store-digital", serviceOptionIds: ["digital"] }];

function targetOf(url: string): URL {
  const u = new URL(url);
  return new URL(u.hostname === "api.scraperapi.com" ? u.searchParams.get("url")! : url);
}

function standIn({ own = JHB, nearby = [], at = {}, products = [rawProduct], lookupFails = false, emptyAt = [] }: SiteStandIn = {}) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const target = targetOf(url);
    const body = JSON.parse(String(init.body ?? "null"));
    if (target.pathname === "/api/store/fetch-store-contexts") {
      if (lookupFails) return { ok: false, status: 502, statusText: "Bad Gateway" } as Response;
      const { latitude } = body.address.coordinates;
      // Each site's own default place: Sandton, or Sophiatown for Shoprite (#157).
      const home = latitude === DEFAULT_PLACE.latitude || latitude === SHOPRITE_SITE.defaultPlace!.latitude;
      return jsonResponse({ storeContexts: home ? own : (at[String(latitude)] ?? DIGITAL) });
    }
    if (target.pathname === "/api/browse-by-store/get-stores-by-location") return jsonResponse(nearby);
    if (target.pathname === "/api/catalogue/get-products-filter") {
      const named: StoreContext[] = body?.storeContexts ?? [];
      return jsonResponse({ products: named.some((c) => emptyAt.includes(c.storeId)) ? [] : products });
    }
    return { ok: false, status: 404, statusText: "Not Found" } as Response;
  });
}

const calls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => targetOf(String(url)).pathname === path);
const searchCall = () => calls("/api/catalogue/get-products-filter")[0];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  standIn();
  forgetBranches();
  // Each test says which of these it needs.
  delete process.env.SCRAPERAPI_KEY;
  delete process.env.CHECKERS_COOKIES;
  delete process.env.SHOPRITE_COOKIES;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
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

const branchCookie = (contexts: StoreContext[]) => `storeContexts=${encodeURIComponent(JSON.stringify(contexts))}`;

describe("each site prices its own Joburg branch", () => {
  // The whole risk of sharing one implementation is that Shoprite quietly ends up
  // asking Checkers, or pricing against a Checkers store. These two are the guard.

  it("Checkers asks checkers.co.za which branch serves Sandton, then searches that branch", async () => {
    await new CheckersScraper().search("milk");

    const [lookupUrl, lookup] = calls("/api/store/fetch-store-contexts")[0];
    expect(targetOf(String(lookupUrl)).origin).toBe("https://www.checkers.co.za");
    expect(JSON.parse(String(lookup.body)).address.coordinates).toEqual({
      latitude: DEFAULT_PLACE.latitude,
      longitude: DEFAULT_PLACE.longitude,
    });

    const [url, init] = searchCall();
    expect(url).toBe("https://www.checkers.co.za/api/catalogue/get-products-filter");
    expect(init.headers.Origin).toBe("https://www.checkers.co.za");
    expect(JSON.parse(init.body).storeContexts).toEqual(JHB);
  });

  it("Shoprite asks shoprite.co.za, never Checkers", async () => {
    await new ShopriteScraper().search("milk");

    for (const [url] of fetchMock.mock.calls) expect(targetOf(String(url)).origin).toBe("https://www.shoprite.co.za");
    expect(searchCall()[1].headers.Origin).toBe("https://www.shoprite.co.za");
  });

  // The bug #66 found: the branch went in the body only, which the sites
  // ignore, so every search was priced at one national default store.
  it("sends the branch as the storeContexts cookie, which is what the site reads", async () => {
    await new CheckersScraper().search("milk");
    expect(searchCall()[1].headers.Cookie).toBe(branchCookie(JHB));
  });
});

describe("where Shoprite doesn't deliver", () => {
  const nearby = [
    { name: "Shoprite Alexandra", coordinates: { latitude: -26.10, longitude: 28.09 } },
    { name: "Shoprite No Coordinates" },
    { name: "Shoprite Sophiatown", coordinates: { latitude: -26.17, longitude: 27.98 } },
  ];
  const SOPHIATOWN: StoreContext[] = [{ storeId: "store-sophiatown", serviceOptionIds: ["sixty-min-delivery"] }];

  it("prices at the nearest store that does, asking from each one's own coordinates", async () => {
    standIn({ own: DIGITAL, nearby, at: { "-26.17": SOPHIATOWN } });

    await new ShopriteScraper().search("milk");

    expect(JSON.parse(String(calls("/api/browse-by-store/get-stores-by-location")[0][1].body)).payload).toMatchObject({
      latitude: SHOPRITE_SITE.defaultPlace!.latitude,
      brands: ["Shoprite"],
    });
    // Its default place, then Alexandra (digital only), then Sophiatown; the
    // one with no coordinates is skipped rather than asked about the wrong place.
    expect(calls("/api/store/fetch-store-contexts")).toHaveLength(3);
    expect(searchCall()[1].headers.Cookie).toBe(branchCookie(SOPHIATOWN));
  });

  it("falls back to the site's own default when nowhere nearby delivers, and says the zone is unknown", async () => {
    standIn({ own: DIGITAL, nearby });

    const [product] = await new ShopriteScraper().search("milk");

    expect(JSON.parse(searchCall()[1].body).storeContexts).toEqual([]);
    expect(searchCall()[1].headers.Cookie).toBeUndefined();
    expect(product.zone).toBe("unconfigured");
  });
});

describe("the branch is looked up rarely", () => {
  it("once for many searches and zone checks", async () => {
    const scraper = new CheckersScraper();
    await scraper.search("milk");
    await scraper.search("bread");
    await scraper.currentZone();
    await new CheckersScraper().search("eggs");

    expect(calls("/api/store/fetch-store-contexts")).toHaveLength(1);
  });

  it("again after a week, without making a search wait for it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await new CheckersScraper().search("milk");
    vi.setSystemTime(Date.now() + BRANCH_TTL_MS + 1);

    // The site has moved the branch, and answers slowly.
    const MOVED: StoreContext[] = [{ storeId: "store-moved", serviceOptionIds: ["sixty-min-delivery"] }];
    let answer!: () => void;
    const slow = new Promise<void>((resolve) => (answer = resolve));
    fetchMock.mockImplementation(async (url: string) => {
      const path = targetOf(url).pathname;
      if (path === "/api/store/fetch-store-contexts") {
        await slow;
        return jsonResponse({ storeContexts: MOVED });
      }
      return jsonResponse({ products: [rawProduct] });
    });

    // Served at once, from the branch it already knew.
    const [stale] = await new CheckersScraper().search("milk");
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body)).storeContexts).toEqual(JHB);

    answer();
    await vi.waitFor(async () => expect(await new CheckersScraper().currentZone()).not.toBe(stale.zone));
    const [fresh] = await new CheckersScraper().search("milk");
    expect(fresh.zone).not.toBe(stale.zone);
  });

  it("a failed refresh keeps the branch it had", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    const [before] = await new CheckersScraper().search("milk");
    vi.setSystemTime(Date.now() + BRANCH_TTL_MS + 1);
    standIn({ lookupFails: true });

    await new CheckersScraper().search("milk");
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
    const [after] = await new CheckersScraper().search("milk");

    expect(after.zone).toBe(before.zone);
  });

  it("a failed lookup still searches, at the site's default store, and is retried within minutes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    standIn({ lookupFails: true });

    const [product] = await new CheckersScraper().search("milk");
    expect(JSON.parse(searchCall()[1].body).storeContexts).toEqual([]);
    expect(product.zone).toBe("unconfigured");

    standIn();
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    const [later] = await new CheckersScraper().search("milk");
    expect(later.zone).not.toBe("unconfigured");
  });
});

describe("ScraperAPI routing", () => {
  it("goes through the proxy when a key is set, keeping the store URL intact", async () => {
    process.env.SCRAPERAPI_KEY = "test-key";
    process.env.SHOPRITE_COOKIES = "aws-waf-token=abc";

    await new ShopriteScraper().search("milk");

    const [url, init] = searchCall();
    expect(url).toContain("api.scraperapi.com");
    expect(url).toContain("keep_headers=true");
    expect(url).toContain(encodeURIComponent("https://www.shoprite.co.za/api/catalogue/get-products-filter"));
    // aws-waf-token is bound to the IP that solved the challenge, so forwarding
    // a browser's cookie through someone else's exit node is worse than useless.
    // The branch cookie is the only one sent.
    expect(init.headers.Cookie).toBe(branchCookie(JHB));
  });

  it("without a key (local dev) sends the developer's cookie, with the branch replacing its storeContexts", async () => {
    process.env.CHECKERS_COOKIES = `aws-waf-token=abc; storeContexts=${encodeURIComponent('[{"storeId":"old"}]')}; other=1`;

    await new CheckersScraper().search("milk");

    expect(searchCall()[1].headers.Cookie).toBe(`aws-waf-token=abc; other=1; ${branchCookie(JHB)}`);
  });
});

describe("failures", () => {
  it("throws with the site's name so the log says which one broke", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      targetOf(url).pathname === "/api/catalogue/get-products-filter"
        ? ({ ok: false, status: 403, statusText: "Forbidden" } as Response)
        : jsonResponse({ storeContexts: JHB })
    );

    await expect(new ShopriteScraper().search("milk")).rejects.toThrow("Shoprite API returned 403");
    await expect(new CheckersScraper().search("milk")).rejects.toThrow("Checkers API returned 403");
  });
});

// #75: every result search() returns is tagged with an opaque zone
// identifier for the branch it was priced at.
describe("carries an opaque Price Zone identifier", () => {
  it("is the same for the same stores, whatever order or capacity they come with", async () => {
    const [first] = await new ShopriteScraper().search("milk");
    forgetBranches();
    standIn({ own: [{ ...JHB[1], hasCapacity: ["one-day-delivery"] }, JHB[0]] });
    const [second] = await new ShopriteScraper().search("milk");

    expect(first.zone).toBe(second.zone);
    expect(first.zone).not.toBe("unconfigured");
  });

  it("is different for a different branch", async () => {
    const [branchOne] = await new ShopriteScraper().search("milk");
    forgetBranches();
    standIn({ own: [{ storeId: "store-elsewhere", serviceOptionIds: ["sixty-min-delivery"] }] });
    const [branchTwo] = await new ShopriteScraper().search("milk");

    expect(branchOne.zone).not.toBe(branchTwo.zone);
  });

  it("never stores the store ids themselves as the zone", async () => {
    const [product] = await new ShopriteScraper().search("milk");
    expect(product.zone).not.toContain("store-jhb");
  });
});

// #76 checks the zone against the search cache before deciding whether to
// scrape at all.
describe("currentZone", () => {
  // Checkers: Shoprite test-searches a branch once while finding it (#134).
  it("matches what a live search tags its results with, without searching", async () => {
    const scraper = new CheckersScraper();

    const declaredZone = await scraper.currentZone();
    expect(searchCall()).toBeUndefined();

    const [product] = await scraper.search("milk");
    expect(declaredZone).toBe(product.zone);
  });
});

// #131: a list priced at its own branch.
describe("a list's own branch", () => {
  const SEA_POINT: StoreContext[] = [{ storeId: "store-sea-point", serviceOptionIds: ["sixty-min-delivery"] }];
  const branch = { name: "Checkers Sea Point Towers", contexts: SEA_POINT };

  it("is searched as that branch, with no default lookup", async () => {
    await new CheckersScraper().search("milk", branch);

    expect(calls("/api/store/fetch-store-contexts")).toHaveLength(0);
    expect(searchCall()[1].headers.Cookie).toBe(branchCookie(SEA_POINT));
    expect(JSON.parse(searchCall()[1].body).storeContexts).toEqual(SEA_POINT);
  });

  it("has its own zone, which a search at it is tagged with", async () => {
    const scraper = new CheckersScraper();
    const zone = await scraper.currentZone(branch);
    const [product] = await scraper.search("milk", branch);

    expect(zone).toBe(product.zone);
    expect(zone).not.toBe(await scraper.currentZone());
  });
});

describe("the branch nearest a shopper", () => {
  const HERE = { latitude: -33.9175, longitude: 18.387 };

  it("is the stores the site names for that point, under the nearest store's name", async () => {
    standIn({ at: { [String(HERE.latitude)]: JHB }, nearby: [{ name: "Checkers Sea Point Towers" }] });

    const found = await new CheckersScraper().nearestBranch(HERE);

    expect(found).toEqual({ name: "Checkers Sea Point Towers", contexts: JHB });
    const [, lookup] = calls("/api/store/fetch-store-contexts")[0];
    expect(JSON.parse(String(lookup.body)).address.coordinates).toEqual(HERE);
    expect(JSON.parse(String(lookup.body)).address.fullAddress).toBe("South Africa");
  });

  it("is none when nothing nearby delivers", async () => {
    standIn({ at: { [String(HERE.latitude)]: DIGITAL }, nearby: [] });
    expect(await new CheckersScraper().nearestBranch(HERE)).toBeNull();
  });

  it("is still found when its name can't be: the store's own name stands in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    standIn({ at: { [String(HERE.latitude)]: JHB } });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const path = targetOf(url).pathname;
      if (path === "/api/browse-by-store/get-stores-by-location") return { ok: false, status: 500, statusText: "Error" } as Response;
      const body = JSON.parse(String(init.body ?? "null"));
      return jsonResponse({ storeContexts: body.address.coordinates.latitude === HERE.latitude ? JHB : [] });
    });

    expect(await new CheckersScraper().nearestBranch(HERE)).toEqual({ name: "Checkers", contexts: JHB });
  });
});

// #134: a Shoprite list priced at the nearest Shoprite that delivers.
describe("the nearest Shoprite that delivers", () => {
  // Not the default Sandton point, which the stand-in answers as the default.
  const HERE = { latitude: -26.15, longitude: 28.05 };
  const store = (name: string, latitude: number) => ({ name, coordinates: { latitude, longitude: 28 } });
  const ctx = (id: string): StoreContext[] => [{ storeId: id, serviceOptionIds: ["sixty-min-delivery"] }];

  it("skips a store that says it delivers but sells nothing, as Milnerton did", async () => {
    standIn({
      at: { [String(HERE.latitude)]: DIGITAL, "-26.1": ctx("milnerton"), "-26.2": ctx("sophiatown") },
      nearby: [store("Shoprite Milnerton", -26.1), store("Shoprite Sophiatown", -26.2)],
      emptyAt: ["milnerton"],
    });

    expect(await new ShopriteScraper().nearestBranch(HERE)).toEqual({ name: "Shoprite Sophiatown", contexts: ctx("sophiatown") });
  });

  it("is named after the store that delivers, not the one nearest the shopper", async () => {
    standIn({
      at: { [String(HERE.latitude)]: DIGITAL, "-26.2": ctx("sophiatown") },
      nearby: [store("Shoprite Alexandra", -26.1), store("Shoprite Sophiatown", -26.2)],
    });

    expect((await new ShopriteScraper().nearestBranch(HERE))?.name).toBe("Shoprite Sophiatown");
  });

  // #157: each store asked costs a ScraperAPI credit.
  it("asks about nearby stores one at a time, and stops at the nearest that delivers", async () => {
    const nearby = Array.from({ length: 10 }, (_, i) => store(`Shoprite ${i}`, -27 - i / 100));
    standIn({ at: { [String(HERE.latitude)]: DIGITAL, "-27.05": ctx("five"), "-27.06": ctx("six") }, nearby });

    expect((await new ShopriteScraper().nearestBranch(HERE))?.name).toBe("Shoprite 5");
    // The shopper's own address, then Shoprite 0 to 5: nothing after it.
    expect(calls("/api/store/fetch-store-contexts")).toHaveLength(1 + 6);
  });

  it("asks about the nearest 8 stores at most, then gives up", async () => {
    expect(NEAREST_TRIES).toBe(8);
    const nearby = Array.from({ length: 12 }, (_, i) => store(`Shoprite ${i}`, -27 - i / 100));
    // Only the tenth delivers: beyond the eight that are asked about.
    standIn({ at: { [String(HERE.latitude)]: DIGITAL, "-27.09": ctx("ten") }, nearby });

    expect(await new ShopriteScraper().nearestBranch(HERE)).toBeNull();
    expect(JSON.parse(String(calls("/api/browse-by-store/get-stores-by-location")[0][1].body)).payload.limit).toBe(8);
    expect(calls("/api/store/fetch-store-contexts")).toHaveLength(1 + 8);
  });

  it("is none when nothing nearby delivers", async () => {
    standIn({ at: { [String(HERE.latitude)]: DIGITAL }, nearby: [store("Shoprite Far", -26.5)] });
    expect(await new ShopriteScraper().nearestBranch(HERE)).toBeNull();
  });

  // "Doesn't deliver here" must never be what a failed request looks like.
  it("fails, rather than answering none, when a request fails", async () => {
    standIn({ at: { [String(HERE.latitude)]: DIGITAL }, nearby: [store("Shoprite Far", -26.5)] });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? "null"));
      if (targetOf(url).pathname === "/api/store/fetch-store-contexts" && body.address.coordinates.latitude === -26.5)
        return { ok: false, status: 502, statusText: "Bad Gateway" } as Response;
      if (targetOf(url).pathname === "/api/browse-by-store/get-stores-by-location") return jsonResponse([store("Shoprite Far", -26.5)]);
      return jsonResponse({ storeContexts: DIGITAL });
    });

    await expect(new ShopriteScraper().nearestBranch(HERE)).rejects.toThrow("Shoprite API returned 502");
  });

  it("Checkers isn't test-searched: its branches have always sold", async () => {
    standIn({ at: { [String(HERE.latitude)]: JHB }, emptyAt: ["store-jhb-1", "store-jhb-2"] });
    expect(await new CheckersScraper().nearestBranch(HERE)).not.toBeNull();
    expect(searchCall()).toBeUndefined();
  });
});
