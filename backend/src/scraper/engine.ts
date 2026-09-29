import type { Product, StoreSlug } from "@accucery/types";
import type { Scraper } from "./types.js";
import { CheckersScraper, ShopriteScraper } from "./shopriteGroup.js";
import { PnpScraper } from "./pnp.js";
import { WoolworthsScraper } from "./woolworths.js";
import { MakroScraper } from "./makro.js";
import { playwrightScraper } from "./playwright.js";
import { NO_ZONE } from "./zone.js";

export type ScraperRegistry = Partial<Record<StoreSlug, Scraper>>;

// A search engine is a registry plus its own per-store serial queue — the
// queue is per-instance, not module-level, so a test engine built from a
// fake registry can prove the queue itself works (no two calls for the same
// store overlap) without sharing state with production or with any other
// test. See #74: this is the whole reason `searchProducts` isn't just a
// bare function reading a module-level registry any more.
export function createSearchEngine(registry: ScraperRegistry) {
  // Per-store serial queue — at most one in-flight request per store at a time.
  const storeQueues = new Map<string, Promise<unknown>>();

  function withStoreQueue<T>(store: string, fn: () => Promise<T>): Promise<T> {
    const head = storeQueues.get(store) ?? Promise.resolve();
    // Always run fn when the previous request finishes, whether it succeeded or failed
    const tail = head.then(() => fn(), () => fn());
    // Store a settled version so the next request always gets a slot
    storeQueues.set(store, tail.then(() => {}, () => {}));
    return tail;
  }

  async function searchProducts(store: StoreSlug, query: string): Promise<Product[]> {
    const scraper = registry[store];
    if (!scraper) return [];

    return withStoreQueue(store, async () => {
      try {
        return await scraper.search(query);
      } catch (err) {
        console.error(`[scraper:${store}] primary failed, trying Playwright fallback:`, err);
        return playwrightScraper.search(store, query);
      }
    });
  }

  // The zone a store is currently configured for, without scraping — #76
  // checks this against the search cache before deciding whether a live
  // scrape is even needed. An unregistered store has no zone concept of its
  // own; NO_ZONE is as good as any value nothing will ever look up.
  function currentZone(store: StoreSlug): string {
    return registry[store]?.currentZone() ?? NO_ZONE;
  }

  return { searchProducts, currentZone };
}

// Registered so /api/search can be used to verify it, but STORE_CONFIGS still
// has woolworths active: false, so the UI shows it as coming soon and will not
// open a list against it. Which of p10/p30/p60 a shopper actually pays is not
// yet confirmed, and an unverified price is worse than an absent store — see
// WOOLWORTHS_PRICE_ZONE in .env.example.
const defaultRegistry: ScraperRegistry = {
  checkers: new CheckersScraper(),
  shoprite: new ShopriteScraper(),
  "pick-n-pay": new PnpScraper(),
  woolworths: new WoolworthsScraper(),
  makro: new MakroScraper(),
};

// Production wiring — unchanged from before #74, just built through the
// same factory a test uses.
export const { searchProducts, currentZone } = createSearchEngine(defaultRegistry);
