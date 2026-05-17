import type { Page } from "playwright";
import type { Product, StoreSlug } from "@accucery/types";
import { normalise as parseCheckers } from "./checkers.js";
import { normalise as parsePnp } from "./pnp.js";

const CHECKERS_API = "https://www.checkers.co.za/api/catalogue/get-products-filter";

interface Strategy {
  warmupUrl?: string;
  // browser-side fetch: runs fetch() inside the page context (Checkers)
  browserSearch?: (page: Page, query: string) => Promise<unknown>;
  // navigation interception: navigate and intercept the XHR (PnP)
  searchUrl?: (query: string) => string;
  interceptsUrl?: (url: string) => boolean;
  parse: (json: unknown) => Product[];
}

const STRATEGIES: Partial<Record<StoreSlug, Strategy>> = {
  checkers: {
    warmupUrl: "https://www.checkers.co.za/",
    browserSearch: async (page, query) => {
      // Read storeContexts cookie that the homepage sets
      const cookies = await page.context().cookies("https://www.checkers.co.za");
      const sc = cookies.find((c) => c.name === "storeContexts");
      let storeContexts: unknown[] = [];
      if (sc) {
        try { storeContexts = JSON.parse(decodeURIComponent(sc.value)); } catch { /**/ }
      }
      // Fallback: homepage may not set storeContexts on a fresh VPS visit — use env cookie
      if (!storeContexts.length) {
        const envSc = (process.env.CHECKERS_COOKIES ?? "").match(/(?:^|;\s*)storeContexts=([^;]*)/);
        if (envSc) {
          try { storeContexts = JSON.parse(decodeURIComponent(envSc[1])); } catch { /**/ }
        }
      }

      const body = JSON.stringify({
        storeContexts,
        filterData: {
          filter: {
            showAllDisplayVariants: false,
            showNotRangedProducts: false,
            productListSource: { search: query },
            paginationOptions: { page: 0, pageSize: 20 },
            filterOptions: {
              filterIds: [], dealsOnly: false, brandOptions: [],
              departmentOptions: [], serviceOptions: [], facetOptions: [],
            },
            sortOptions: null,
          },
          displayOptions: { includeDisplayCategoryTree: false },
        },
        forYouBonusBuyIds: [],
        url: null,
      });

      // page.evaluate runs inside Chrome — cookies auto-included, TLS fingerprint is Chrome's
      return page.evaluate(
        async ({ apiUrl, reqBody }) => {
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "*/*" },
            body: reqBody,
          });
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        },
        { apiUrl: CHECKERS_API, reqBody: body }
      );
    },
    parse: parseCheckers,
  },

  "pick-n-pay": {
    searchUrl: (q) => `https://www.pnp.co.za/search/${encodeURIComponent(q)}`,
    interceptsUrl: (url) => url.includes("ac.cnstrc.com/search"),
    parse: parsePnp,
  },
};

export class PlaywrightScraper {
  constructor(private readonly strategies: Partial<Record<StoreSlug, Strategy>>) {}

  async search(store: StoreSlug, query: string): Promise<Product[]> {
    const strategy = this.strategies[store];
    if (!strategy) return [];

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 768 },
      });
      const page = await context.newPage();

      if (strategy.warmupUrl) {
        await page.goto(strategy.warmupUrl, { waitUntil: "networkidle", timeout: 30000 });
      }

      let json: unknown;
      if (strategy.browserSearch) {
        json = await strategy.browserSearch(page, query);
      } else {
        const responsePromise = page.waitForResponse(
          (res) => strategy.interceptsUrl!(res.url()),
          { timeout: 45000 }
        );
        await page.goto(strategy.searchUrl!(query), {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        json = await (await responsePromise).json();
      }

      const products = strategy.parse(json);
      if (products.length === 0) {
        const keys = json && typeof json === "object" ? Object.keys(json as object) : json;
        console.warn(`[playwright:${store}] 0 products. Raw top-level keys:`, keys);
      }
      return products;
    } finally {
      await browser.close();
    }
  }
}

export const playwrightScraper = new PlaywrightScraper(STRATEGIES);
