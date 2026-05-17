import type { Product, StoreSlug } from "@accucery/types";
import type { Scraper } from "./types.js";
import { CheckersScraper } from "./checkers.js";
import { PnpScraper } from "./pnp.js";
import { playwrightScraper } from "./playwright.js";

const registry: Partial<Record<StoreSlug, Scraper>> = {
  checkers: new CheckersScraper(),
  "pick-n-pay": new PnpScraper(),
};

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

export async function searchProducts(
  store: StoreSlug,
  query: string
): Promise<Product[]> {
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
