import type { Product } from "@accucery/types";
import type { Scraper } from "./types.js";

// Checkers and Shoprite are both Shoprite Holdings and run the same commerce
// platform: same `/api/catalogue/get-products-filter` endpoint, same request
// body, same field names in the response. Probed rather than assumed — see
// scripts/probe-shoprite.sh and docs/journal/2026-09-16-probe-before-writing-shoprite.md.
//
// They differ in exactly two things, so those are the two things this takes:
// which host to ask, and which environment variable holds that host's cookie.

export interface ShopriteGroupSite {
  /** Appears in error messages and logs. */
  label: string;
  /** Scheme and host, no trailing slash. */
  origin: string;
  /** Name of the env var holding a browser cookie string for this host. */
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

// storeContexts says which physical store to price against. It is per-retailer:
// a Checkers value names Checkers stores and means nothing to Shoprite, which is
// why each site reads its own cookie. An empty array is valid — the site then
// prices against its own default — so a missing cookie degrades rather than fails.
export function parseStoreContexts(cookieStr: string): unknown[] {
  const match = cookieStr.match(/(?:^|;\s*)storeContexts=([^;]*)/);
  if (!match) return [];
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return [];
  }
}

/** The catalogue endpoint both sites serve. */
export function apiUrl(site: ShopriteGroupSite): string {
  return `${site.origin}/api/catalogue/get-products-filter`;
}

// Takes storeContexts already parsed rather than a cookie string: the Playwright
// fallback gets its value from a live browser cookie jar, not from an env var.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the store's response is untyped third-party JSON; the shape is checked field by field below
export function normalise(raw: any): Product[] {
  const items: unknown[] =
    raw?.products ?? raw?.data?.products ?? raw?.results ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one element at a time
  return (items as any[])
    .slice(0, 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one element at a time
    .map((item: any): Product | null => {
      const productId = String(item.id ?? "");
      const name = String(item.name ?? "");
      const imageUrl = String(item.imageProductCardURL ?? item.imageURL ?? "");
      const regularPrice = Number(item.price ?? 0);
      const loyaltyPrice =
        item.bonusBuy?.discountValue != null ? Number(item.bonusBuy.discountValue) : null;

      if (!productId || !name) return null;
      return { productId, name, imageUrl, regularPrice, loyaltyPrice };
    })
    .filter((p): p is Product => p !== null);
}

export class ShopriteGroupScraper implements Scraper {
  constructor(private readonly site: ShopriteGroupSite) {}

  async search(query: string): Promise<Product[]> {
    const { site } = this;
    const searchUrl = apiUrl(site);
    const cookies = process.env[site.cookieEnv] ?? "";
    const scraperApiKey = process.env.SCRAPERAPI_KEY;

    const headers = baseHeaders(site);

    let url: string;
    if (scraperApiKey) {
      // A VPS datacenter IP is blocked by the WAF in front of these sites, so the
      // request goes through ScraperAPI's residential pool. aws-waf-token is bound
      // to the IP that solved the challenge and is useless from another one, so no
      // cookies are forwarded here; storeContexts travels in the POST body instead.
      url = `http://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}&keep_headers=true`;
    } else {
      // Local dev: the developer's own residential IP, so the browser cookies work.
      url = searchUrl;
      if (cookies) headers["Cookie"] = cookies;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: buildBody(query, parseStoreContexts(cookies)),
    });
    if (!res.ok) {
      throw new Error(`${site.label} API returned ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    return normalise(json);
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
