import type { Product } from "@accucery/types";
import type { Scraper } from "./types.js";
import { opaqueZone } from "./zone.js";

// Checkers and Shoprite are both Shoprite Holdings and run the same commerce
// platform: same `/api/catalogue/get-products-filter` endpoint, same request
// body, same field names in the response. Probed rather than assumed — see
// scripts/probe-shoprite.sh and docs/journal/2026-09-16-probe-before-writing-shoprite.md.
//
// They differ in exactly two things, so those are the two things this takes:
// which host to ask, and which environment variable holds a developer's
// browser cookie for it (local dev only, without ScraperAPI).

export interface ShopriteGroupSite {
  /** Appears in error messages and logs. */
  label: string;
  /** Scheme and host, no trailing slash. */
  origin: string;
  /** Env var holding a developer's browser cookie for this host, for local dev without ScraperAPI. */
  cookieEnv: string;
}

export const CHECKERS_SITE: ShopriteGroupSite = {
  label: "Checkers",
  origin: "https://www.checkers.co.za",
  cookieEnv: "CHECKERS_COOKIES",
};

export const SHOPRITE_SITE: ShopriteGroupSite = {
  label: "Shoprite",
  origin: "https://www.shoprite.co.za",
  cookieEnv: "SHOPRITE_COOKIES",
};

function baseHeaders(site: ShopriteGroupSite): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
    "Accept": "*/*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Content-Type": "application/json",
    "Origin": site.origin,
    "Referer": `${site.origin}/search`,
  };
}

/** The catalogue endpoint both sites serve. */
export function apiUrl(site: ShopriteGroupSite): string {
  return `${site.origin}/api/catalogue/get-products-filter`;
}

// storeContexts says which branch to price against. The sites read it from a
// cookie (#66); it rides in the body too, as a browser sends it.
export function buildBody(query: string, storeContexts: unknown[]) {
  return JSON.stringify({
    storeContexts,
    filterData: {
      filter: {
        showAllDisplayVariants: false,
        showNotRangedProducts: false,
        productListSource: { search: query },
        paginationOptions: { page: 0, pageSize: 20 },
        filterOptions: {
          filterIds: [],
          dealsOnly: false,
          brandOptions: [],
          departmentOptions: [],
          serviceOptions: [],
          facetOptions: [],
        },
        sortOptions: null,
      },
      displayOptions: { includeDisplayCategoryTree: false },
    },
    forYouBonusBuyIds: [],
    url: null,
  });
}

// The zone lives in search()'s cookie, not in anything this function reads,
// so normalise() stays a pure function of the response body - the shape its
// own tests exercise directly - and returns everything but that field.
type UnzonedProduct = Omit<Product, "zone">;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the store's response is untyped third-party JSON; the shape is checked field by field below
export function normalise(raw: any): UnzonedProduct[] {
  const items: unknown[] =
    raw?.products ?? raw?.data?.products ?? raw?.results ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one element at a time
  return (items as any[])
    .slice(0, 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one element at a time
    .map((item: any): UnzonedProduct | null => {
      const productId = String(item.id ?? "");
      const name = String(item.name ?? "");
      const imageUrl = String(item.imageProductCardURL ?? item.imageURL ?? "");
      const regularPrice = Number(item.price ?? 0);
      const loyaltyPrice =
        item.bonusBuy?.discountValue != null ? Number(item.bonusBuy.discountValue) : null;

      if (!productId || !name) return null;
      return { productId, name, imageUrl, regularPrice, loyaltyPrice };
    })
    .filter((p): p is UnzonedProduct => p !== null);
}

// ---------------------------------------------------------------------------
// Which branch to price against (#66).
//
// Measured with scripts/probe-location-prices.mjs, 2026-10-03:
//   - The sites only honour a branch sent as a storeContexts COOKIE. The same
//     value in the request body alone is ignored, and every search is priced
//     at one national default store. Until this change that is what the app
//     showed everyone: the body carried the branch, no cookie did.
//   - A branch is found from coordinates: fetch-store-contexts takes an
//     address and answers with the stores that serve it.
//   - Shoprite delivers in some areas only. Elsewhere it names just a
//     "digital" store, which sells nothing; the nearest Shoprite that does
//     deliver is found by asking again from each nearby store's coordinates.

/** One entry of the site's storeContexts: a store and how it serves. */
export interface StoreContext {
  storeId: string;
  serviceOptionIds?: string[] | null;
  [field: string]: unknown;
}

/** Where a shopper who hasn't shared a location is priced (decided on #66). */
export const DEFAULT_PLACE = { city: "Sandton", latitude: -26.1076, longitude: 28.0567 };

// How many nearby stores to ask from before giving up. From Sandton the
// nearest Shoprite that delivers (Sophiatown, 10.8 km) was within 25.
const NEAREST_TRIES = 25;

// A found branch is kept this long: stores open, close and change service,
// but not by the minute, and each lookup spends ScraperAPI credits.
const BRANCH_TTL_MS = 6 * 60 * 60 * 1000;
// A failed lookup is retried sooner, so one bad minute doesn't leave six
// hours of default-store prices.
const FAILED_TTL_MS = 5 * 60 * 1000;

/** A store that sells groceries online, rather than only "digital" things. */
export function sellsGroceries(contexts: StoreContext[]): boolean {
  return contexts.some((c) => (c.serviceOptionIds ?? []).some((s) => s !== "digital"));
}

/** The cookie the sites read the branch from: URL-encoded JSON. */
export function storeContextsCookie(contexts: StoreContext[]): string {
  return `storeContexts=${encodeURIComponent(JSON.stringify(contexts))}`;
}

// The zone names the stores, not the order they came in or the capacity
// fields alongside them, which change hour to hour for the same branch.
export function contextsZone(contexts: StoreContext[]): string {
  return opaqueZone(contexts.map((c) => String(c.storeId)).sort().join(","));
}

function addressBody(place: { city: string; latitude: number; longitude: number }) {
  return {
    address: {
      fullAddress: `${place.city}, South Africa`,
      city: place.city,
      coordinates: { latitude: place.latitude, longitude: place.longitude },
      id: "",
      type: "",
      name: "",
    },
    acceptedLimitedExperience: false,
  };
}

async function post(site: ShopriteGroupSite, path: string, body: unknown, contexts: StoreContext[] = []) {
  const target = `${site.origin}${path}`;
  const scraperApiKey = process.env.SCRAPERAPI_KEY;
  const headers = baseHeaders(site);
  let url: string;
  const cookies: string[] = [];
  if (scraperApiKey) {
    // A VPS datacenter IP is blocked by the WAF in front of these sites, so the
    // request goes through ScraperAPI's residential pool. aws-waf-token is bound
    // to the IP that solved the challenge and is useless from another one, so
    // the browser cookie is never forwarded; keep_headers passes the branch
    // cookie built here.
    url = `http://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(target)}&keep_headers=true`;
  } else {
    // Local dev: the developer's own residential IP, so their browser cookie
    // works - minus any storeContexts in it, which the branch replaces.
    url = target;
    const own = (process.env[site.cookieEnv] ?? "")
      .split(/;\s*/)
      .filter((c) => c && !c.startsWith("storeContexts="));
    cookies.push(...own);
  }
  if (contexts.length) cookies.push(storeContextsCookie(contexts));
  if (cookies.length) headers["Cookie"] = cookies.join("; ");

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`${site.label} API returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * The branch that serves a place: its own delivering store if it has one,
 * otherwise the nearest Shoprite (or Checkers) that delivers. An empty list
 * when nothing nearby does, which the site prices at its national default.
 */
export async function findBranch(
  site: ShopriteGroupSite,
  place: { city: string; latitude: number; longitude: number }
): Promise<StoreContext[]> {
  const own = (await post(site, "/api/store/fetch-store-contexts?update=false", addressBody(place)))?.storeContexts ?? [];
  if (sellsGroceries(own)) return own;

  const nearby = await post(site, "/api/browse-by-store/get-stores-by-location", {
    payload: { latitude: place.latitude, longitude: place.longitude, limit: NEAREST_TRIES, brands: [site.label] },
  });
  for (const store of (Array.isArray(nearby) ? nearby : []).slice(0, NEAREST_TRIES)) {
    const at = store?.coordinates;
    if (typeof at?.latitude !== "number" || typeof at?.longitude !== "number") continue;
    const theirs =
      (await post(site, "/api/store/fetch-store-contexts?update=false", addressBody({ city: String(store.name ?? ""), ...at })))
        ?.storeContexts ?? [];
    if (sellsGroceries(theirs)) return theirs;
  }
  return [];
}

// One remembered default branch per site, shared by the scraper and the
// Playwright fallback so both price the same store.
interface Remembered {
  contexts: Promise<StoreContext[]>;
  until: number;
  /** A lookup answered, even if the answer was "nowhere delivers". */
  answered: boolean;
}
const branches = new Map<string, Remembered>();
const refreshing = new Set<string>();

function lookUp(site: ShopriteGroupSite): Promise<StoreContext[] | null> {
  return findBranch(site, DEFAULT_PLACE).catch((err) => {
    console.error(`[scraper:${site.label}] could not find the default branch:`, err);
    return null;
  });
}

/**
 * The default branch for a site, looked up at most every few hours.
 *
 * Finding a Shoprite that delivers can take a dozen requests through
 * ScraperAPI, a minute or more, so no search waits on a refresh: once a
 * branch is known it keeps being used while a fresh lookup runs behind it.
 * Only the very first lookup is waited for, and warmBranches() starts that
 * when the server does.
 */
export function defaultBranch(site: ShopriteGroupSite): Promise<StoreContext[]> {
  const now = Date.now();
  const known = branches.get(site.label);
  if (known && known.until > now) return known.contexts;

  if (known?.answered) {
    if (!refreshing.has(site.label)) {
      refreshing.add(site.label);
      void lookUp(site).then((found) => {
        refreshing.delete(site.label);
        if (found) branches.set(site.label, { contexts: Promise.resolve(found), until: Date.now() + BRANCH_TTL_MS, answered: true });
        // A failed refresh keeps the branch it had and tries again soon.
        else known.until = Date.now() + FAILED_TTL_MS;
      });
    }
    return known.contexts;
  }

  // Nothing known yet: this caller waits, and so does anyone who asks
  // meanwhile. A failed lookup degrades rather than fails - an empty branch
  // prices at the site's default store, and the zone says "unconfigured"
  // rather than claiming a branch - and is tried again within minutes.
  const entry: Remembered = { contexts: Promise.resolve([]), until: now + BRANCH_TTL_MS, answered: false };
  const pending = lookUp(site);
  entry.contexts = pending.then((found) => found ?? []);
  void pending.then((found) => {
    entry.answered = found !== null;
    entry.until = Date.now() + (found ? BRANCH_TTL_MS : FAILED_TTL_MS);
  });
  branches.set(site.label, entry);
  return entry.contexts;
}

/** Started with the server, so the first shopper doesn't wait for a lookup. */
export function warmBranches(): void {
  for (const site of [CHECKERS_SITE, SHOPRITE_SITE]) void defaultBranch(site);
}

/** Tests only: start each one with no remembered branch. */
export function forgetBranches(): void {
  branches.clear();
  refreshing.clear();
}

export class ShopriteGroupScraper implements Scraper {
  constructor(private readonly site: ShopriteGroupSite) {}

  // Needs the branch, which may mean one lookup every few hours - far
  // cheaper than the scrape a cache check exists to avoid.
  async currentZone(): Promise<string> {
    return contextsZone(await defaultBranch(this.site));
  }

  async search(query: string): Promise<Product[]> {
    const contexts = await defaultBranch(this.site);
    const json = await post(this.site, "/api/catalogue/get-products-filter", JSON.parse(buildBody(query, contexts)), contexts);
    // Attached here, not inside normalise(), which stays a pure function of
    // the response body - the shape its own tests exercise directly.
    const zone = contextsZone(contexts);
    return normalise(json).map((p) => ({ ...p, zone }));
  }
}

export class CheckersScraper extends ShopriteGroupScraper {
  constructor() {
    super(CHECKERS_SITE);
  }
}

export class ShopriteScraper extends ShopriteGroupScraper {
  constructor() {
    super(SHOPRITE_SITE);
  }
}
