import { createRequire } from "node:module";
import type { Page } from "playwright";
import type { Product, StoreSlug } from "@accucery/types";
import {
  apiUrl,
  buildBody,
  parseStoreContexts,
  normalise as parseShopriteGroup,
  CHECKERS_SITE,
  SHOPRITE_SITE,
  type ShopriteGroupSite,
} from "./shopriteGroup.js";
import { normalise as parsePnp } from "./pnp.js";
// playwright-extra + stealth give Playwright a real-browser fingerprint to pass AWS WAF Bot Control
import { chromium as chromiumExtra } from "playwright-extra";
import { newInjectedContext } from "fingerprint-injector";
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- puppeteer-extra-plugin-stealth ships no types, and it is loaded through createRequire because it is CommonJS
const StealthPlugin = _require("puppeteer-extra-plugin-stealth") as any;
chromiumExtra.use(StealthPlugin());

interface Strategy {
  warmupUrl?: string;
  // browser-side fetch: runs fetch() inside the page context (Checkers)
  browserSearch?: (page: Page, query: string) => Promise<unknown>;
  // navigation interception: navigate and intercept the XHR (PnP)
  searchUrl?: (query: string) => string;
  interceptsUrl?: (url: string) => boolean;
  parse: (json: unknown) => Product[];
}

// Checkers and Shoprite are one platform behind one WAF, so they get one
// strategy. See shopriteGroup.ts for what actually differs between them.
function shopriteGroupStrategy(site: ShopriteGroupSite): Strategy {
  return {
    warmupUrl: `${site.origin}/`,
    browserSearch: async (page, query) => {
      // Prefer the storeContexts the homepage just set in this browser.
      const cookies = await page.context().cookies(site.origin);
      const sc = cookies.find((c) => c.name === "storeContexts");
      let storeContexts = sc ? parseStoreContexts(`storeContexts=${sc.value}`) : [];

      // A fresh VPS visit often gets no storeContexts from the homepage, so fall
      // back to the cookie captured from a real browser session.
      if (!storeContexts.length) {
        storeContexts = parseStoreContexts(process.env[site.cookieEnv] ?? "");
      }

      // page.evaluate runs inside Chrome — cookies auto-included, TLS fingerprint is Chrome's
      return page.evaluate(
        async ({ url, reqBody }) => {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "*/*" },
            body: reqBody,
          });
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        },
        { url: apiUrl(site), reqBody: buildBody(query, storeContexts) }
      );
    },
    parse: parseShopriteGroup,
  };
}

const STRATEGIES: Partial<Record<StoreSlug, Strategy>> = {
  checkers: shopriteGroupStrategy(CHECKERS_SITE),
  shoprite: shopriteGroupStrategy(SHOPRITE_SITE),

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

    const browser = await chromiumExtra.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const scraperApiKey = process.env.SCRAPERAPI_KEY;
      // Route the browser itself through the same residential proxy used for the direct HTTP
      // fallback — previously only tried alone (datacenter IP + stealth browser), never combined
      // with a residential IP the way the raw ScraperAPI HTTP path was.
      const context = await newInjectedContext(browser, {
        newContextOptions: {
          viewport: { width: 1366, height: 768 },
          ...(scraperApiKey && {
            proxy: {
              server: "http://proxy-server.scraperapi.com:8001",
              username: "scraperapi",
              password: scraperApiKey,
            },
          }),
        },
      });
      const page = await context.newPage();

      if (strategy.warmupUrl) {
        await page.goto(strategy.warmupUrl, { waitUntil: "networkidle", timeout: 30000 });
        // Verify the WAF challenge was solved (token cookie must now exist)
        const cookies = await context.cookies(strategy.warmupUrl);
        const hasWafToken = cookies.some((c) => c.name === "aws-waf-token");
        if (!hasWafToken) {
          console.warn(`[playwright:${store}] WAF token not set after warmup — bot detection active`);
        }
      }

      let json: unknown;
      if (strategy.browserSearch) {
        json = await strategy.browserSearch(page, query);
      } else {
        const responsePromise = page.waitForResponse(
          (res) => strategy.interceptsUrl!(res.url()),
          { timeout: 45000 }
        );
        // Mark the rejection as handled up front. If the goto below throws, the
        // `finally` closes the browser, this promise rejects with nobody
        // awaiting it, and Node turns that unhandled rejection into a process
        // exit — one failed scrape takes the whole server down. Attaching a
        // handler here does not swallow the error: the `await` below still
        // rejects and the caller still sees it.
        responsePromise.catch(() => {});
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
