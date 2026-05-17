import type { Product, StoreSlug } from "@accucery/types";
import { normalise as parseCheckers } from "./checkers.js";
import { normalise as parsePnp } from "./pnp.js";

interface Strategy {
  searchUrl: (query: string) => string;
  interceptsUrl: (url: string) => boolean;
  parse: (json: unknown) => Product[];
}

const STRATEGIES: Partial<Record<StoreSlug, Strategy>> = {
  checkers: {
    searchUrl: (q) => `https://www.checkers.co.za/search?q=${encodeURIComponent(q)}`,
    interceptsUrl: (url) => url.includes("get-products-filter"),
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

    // Lazy-import so Playwright doesn't load unless the fallback is actually triggered
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const responsePromise = page.waitForResponse(
        (res) => strategy.interceptsUrl(res.url()),
        { timeout: 15000 }
      );
      await page.goto(strategy.searchUrl(query), { waitUntil: "commit", timeout: 15000 });
      const response = await responsePromise;
      return strategy.parse(await response.json());
    } finally {
      await browser.close();
    }
  }
}

export const playwrightScraper = new PlaywrightScraper(STRATEGIES);
