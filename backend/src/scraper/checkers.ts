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

function buildBody(query: string) {
  return JSON.stringify({
    storeContexts: [],
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
    // Cookies (especially aws-waf-token) are required for the WAF to pass the request.
    // Set CHECKERS_COOKIES in your .env to your browser's cookie string for this domain.
    const cookies = process.env.CHECKERS_COOKIES ?? "";
    const headers: Record<string, string> = { ...BASE_HEADERS };
    if (cookies) headers["Cookie"] = cookies;

    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers,
      body: buildBody(query),
    });
    if (!res.ok) {
      throw new Error(`Checkers API returned ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    return normalise(json);
  }
}
