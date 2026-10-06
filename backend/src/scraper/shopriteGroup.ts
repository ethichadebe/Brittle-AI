import type { Product } from "@accucery/types";
import type { Branch, Place, Scraper } from "./types.js";
import { opaqueZone } from "./zone.js";
import { remember, type Remembered, type RememberedStore } from "./remember.js";
import { spendCredit } from "./creditBudget.js";

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
  /**
   * Test-search a branch before accepting it. Shoprite needs this: on #66,
   * Milnerton and Rustenburg named a delivering store and sold nothing.
   */
  verifyBranch?: boolean;
  /**
   * Where the default (Joburg) branch is looked up from. Sandton, unless the
   * site doesn't deliver there: then the store that does, so the first store
   * asked is the one wanted (#157: each store asked costs credits).
   */
  defaultPlace?: { city: string; latitude: number; longitude: number };
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
  verifyBranch: true,
  // Shoprite doesn't deliver in Sandton; Sophiatown, 10.8 km away, prices
  // Joburg (#134). Asked from Sandton it took a dozen requests to reach.
  defaultPlace: { city: "Sophiatown", latitude: -26.1755, longitude: 27.9819 },
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

// How many nearby stores to ask from before giving up (#157, decided with
// the owner): each one asked costs ScraperAPI credits, and the nearest 8
// cover almost every town. Beyond them the list keeps Joburg prices.
export const NEAREST_TRIES = 8;

// A found branch is kept this long, across restarts (#157): stores open,
// close and change service, but not by the week, and each lookup spends
// ScraperAPI credits. Every deploy used to look them up again.
export const BRANCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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

function addressBody(place: { city?: string; latitude: number; longitude: number }) {
  return {
    address: {
      // A shopper's own location comes with no town name; the site places
      // an address by its coordinates.
      fullAddress: place.city ? `${place.city}, South Africa` : "South Africa",
      city: place.city ?? "",
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
    // #157: every request through ScraperAPI is a credit, counted against
    // today's allowance before it's made. Past it, this throws instead.
    await spendCredit(path.includes("/catalogue/") ? "search" : "branch");
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

// How many nearby stores are asked about at once. Finding a Shoprite that
// delivers can mean asking about many, each a few seconds through
// ScraperAPI; a few at a time keeps that well under a minute without
// asking ScraperAPI for more parallel requests than a plan allows.
// One at a time: asking four at once paid for up to three stores that a
// nearer one made unnecessary (#157).
const NEARBY_BATCH = 1;

// Searched to prove a branch sells: something every grocer stocks.
const VERIFY_QUERY = "milk";

/** Whether a branch's stores can be priced: one sells groceries, and - where the site needs it - a search there returns something. */
async function usable(site: ShopriteGroupSite, contexts: StoreContext[]): Promise<boolean> {
  if (!sellsGroceries(contexts)) return false;
  if (!site.verifyBranch) return true;
  const json = await post(site, "/api/catalogue/get-products-filter", JSON.parse(buildBody(VERIFY_QUERY, contexts)), contexts);
  return normalise(json).length > 0;
}

/**
 * The branch that serves a place: its own delivering store if it has one,
 * otherwise the nearest store that delivers, found by asking from each
 * nearby store's own coordinates, nearest first. `storeName` is that store's
 * name when it came from the store finder. Null when nothing nearby does.
 *
 * A failed request fails the lookup rather than being skipped: "Shoprite
 * doesn't deliver here" must never be what a ScraperAPI hiccup looks like.
 */
export async function locateBranch(
  site: ShopriteGroupSite,
  place: { city?: string; latitude: number; longitude: number }
): Promise<{ contexts: StoreContext[]; storeName?: string } | null> {
  const own = (await post(site, "/api/store/fetch-store-contexts?update=false", addressBody(place)))?.storeContexts ?? [];
  if (await usable(site, own)) return { contexts: own };

  const nearby = await post(site, "/api/browse-by-store/get-stores-by-location", {
    payload: { latitude: place.latitude, longitude: place.longitude, limit: NEAREST_TRIES, brands: [site.label] },
  });
  const candidates = (Array.isArray(nearby) ? nearby : [])
    .slice(0, NEAREST_TRIES)
    .filter((s) => typeof s?.coordinates?.latitude === "number" && typeof s?.coordinates?.longitude === "number");
  for (let i = 0; i < candidates.length; i += NEARBY_BATCH) {
    const batch = candidates.slice(i, i + NEARBY_BATCH);
    const named = await Promise.all(
      batch.map(async (store) =>
        ((await post(site, "/api/store/fetch-store-contexts?update=false", addressBody({ city: String(store.name ?? ""), ...store.coordinates })))
          ?.storeContexts ?? []) as StoreContext[]
      )
    );
    // Nearest first, within the batch as across batches.
    for (const [k, contexts] of named.entries()) {
      if (await usable(site, contexts)) {
        const storeName = typeof batch[k].name === "string" && batch[k].name.trim() ? batch[k].name.trim() : undefined;
        return { contexts, storeName };
      }
    }
  }
  return null;
}

/** The stores of the branch that serves a place, or none: see locateBranch. */
export async function findBranch(
  site: ShopriteGroupSite,
  place: { city?: string; latitude: number; longitude: number }
): Promise<StoreContext[]> {
  return (await locateBranch(site, place))?.contexts ?? [];
}

// One remembered default branch per site, shared by the scraper and the
// Playwright fallback so both price the same store. Finding a Shoprite that
// delivers can take a dozen requests through ScraperAPI, so no search waits
// on a refresh: see remember.ts. A failed first lookup prices at the site's
// own default (no branch), and the zone says "unconfigured".
const defaults = new Map<string, Remembered<StoreContext[]>>();

// Where default branches are kept across restarts. Set by the server at
// startup (index.ts); tests leave it unset and remember in memory only.
let branchStore: (<T>(key: string) => RememberedStore<T>) | undefined;

export function keepDefaultBranchesIn(store: <T>(key: string) => RememberedStore<T>): void {
  branchStore = store;
}

/** The default branch for a site, looked up at most once a week. */
export function defaultBranch(site: ShopriteGroupSite): Promise<StoreContext[]> {
  let remembered = defaults.get(site.label);
  if (!remembered) {
    remembered = remember(site.label, () => findBranch(site, site.defaultPlace ?? DEFAULT_PLACE), [], {
      ttlMs: BRANCH_TTL_MS,
      failedTtlMs: FAILED_TTL_MS,
      store: branchStore?.<StoreContext[]>(`default-branch:${site.label}`),
    });
    defaults.set(site.label, remembered);
  }
  return remembered.get();
}

/** Started with the server, so the first shopper doesn't wait for a lookup. */
export function warmBranches(): void {
  for (const site of [CHECKERS_SITE, SHOPRITE_SITE]) void defaultBranch(site);
}

/** Tests only: start each one with no remembered branch. */
export function forgetBranches(): void {
  for (const remembered of defaults.values()) remembered.forget();
  defaults.clear();
}

/** A list's branch at these sites carries the site's own storeContexts. */
function contextsOf(branch: Branch | undefined): StoreContext[] | null {
  return Array.isArray(branch?.contexts) ? (branch.contexts as StoreContext[]) : null;
}

/**
 * The branch nearest a shopper (#131): the stores the site names for that
 * point, or - for Shoprite - the nearest that delivers. Null when nothing
 * nearby does, so the list keeps the default. The name is a label only: a
 * failed name lookup still saves the branch, under the store's own name.
 */
export async function nearestBranch(site: ShopriteGroupSite, place: Place): Promise<Branch | null> {
  const found = await locateBranch(site, place);
  if (!found) return null;
  const { contexts } = found;
  // A store found by the store finder already has its name.
  if (found.storeName) return { name: found.storeName, contexts };
  let name = site.label;
  try {
    const near = await post(site, "/api/browse-by-store/get-stores-by-location", {
      payload: { latitude: place.latitude, longitude: place.longitude, limit: 1, brands: [site.label] },
    });
    if (typeof near?.[0]?.name === "string" && near[0].name.trim()) name = near[0].name.trim();
  } catch (err) {
    console.error(`[scraper:${site.label}] found a branch but not its name:`, err);
  }
  return { name, contexts };
}

export class ShopriteGroupScraper implements Scraper {
  constructor(private readonly site: ShopriteGroupSite) {}

  // A list's own branch, or the default - which may mean one lookup every
  // few hours, far cheaper than the scrape a cache check exists to avoid.
  async currentZone(branch?: Branch): Promise<string> {
    return contextsZone(contextsOf(branch) ?? (await defaultBranch(this.site)));
  }

  nearestBranch(place: Place): Promise<Branch | null> {
    return nearestBranch(this.site, place);
  }

  async search(query: string, branch?: Branch): Promise<Product[]> {
    const contexts = contextsOf(branch) ?? (await defaultBranch(this.site));
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
