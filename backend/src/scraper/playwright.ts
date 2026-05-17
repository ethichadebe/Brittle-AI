import type { Product, StoreSlug } from "@accucery/types";
import { normalise as parseCheckers } from "./checkers.js";
import { normalise as parsePnp } from "./pnp.js";

interface Strategy {
  warmupUrl?: string;
  searchUrl: (query: string) => string;
  interceptsUrl: (url: string) => boolean;
  parse: (json: unknown) => Product[];
}

const STRATEGIES: Partial<Record<StoreSlug, Strategy>> = {
  checkers: {
    // Visit homepage first so the WAF JS challenge runs and issues a token for this IP.
    warmupUrl: "https://www.checkers.co.za/",
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

      const responsePromise = page.waitForResponse(
        (res) => strategy.interceptsUrl(res.url()),
        { timeout: 45000 }
      );
      await page.goto(strategy.searchUrl(query), { waitUntil: "domcontentloaded", timeout: 30000 });
      const response = await responsePromise;
      return strategy.parse(await response.json());
    } finally {
      await browser.close();
    }
  }
}

export const playwrightScraper = new PlaywrightScraper(STRATEGIES);
