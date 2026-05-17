import type { Product } from "@accucery/types";
import type { Scraper } from "./types.js";

const SEARCH_URL = "https://www.checkers.co.za/api/catalogue/get-products-filter";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
  "Accept": "*/*",
  "Accept-Language": "en-GB,en;q=0.9",
  "Content-Type": "application/json",
  "Origin": "https://www.checkers.co.za",
  "Referer": "https://www.checkers.co.za/search",
};

function parseStoreContexts(cookieStr: string): unknown[] {
  const match = cookieStr.match(/(?:^|;\s*)storeContexts=([^;]*)/);
  if (!match) return [];
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return [];
  }
}

function buildBody(query: string, cookies: string) {
  return JSON.stringify({
    storeContexts: parseStoreContexts(cookies),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalise(raw: any): Product[] {
  const items: unknown[] =
    raw?.products ?? raw?.data?.products ?? raw?.results ?? [];
  return (items as any[])
    .slice(0, 20)
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

export class CheckersScraper implements Scraper {
  async search(query: string): Promise<Product[]> {
    const cookies = process.env.CHECKERS_COOKIES ?? "";
    const scraperApiKey = process.env.SCRAPERAPI_KEY;

    const headers: Record<string, string> = { ...BASE_HEADERS };

    let url: string;
    if (scraperApiKey) {
      // VPS datacenter IP is blocked by Checkers WAF — route through ScraperAPI residential proxy.
      // aws-waf-token is IP-bound so we don't forward cookies; storeContexts go in the POST body.
      url = `http://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(SEARCH_URL)}&keep_headers=true`;
    } else {
      // Local dev: send browser cookies directly (aws-waf-token works from a residential IP).
      url = SEARCH_URL;
      if (cookies) headers["Cookie"] = cookies;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: buildBody(query, cookies),
    });
    if (!res.ok) {
      throw new Error(`Checkers API returned ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    return normalise(json);
  }
}
