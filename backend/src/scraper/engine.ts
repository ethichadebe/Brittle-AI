import type { Product, StoreSlug } from "@accucery/types";
import type { Scraper } from "./types.js";
import { CheckersScraper, ShopriteScraper } from "./shopriteGroup.js";
import { PnpScraper } from "./pnp.js";
import { WoolworthsScraper } from "./woolworths.js";
import { MakroScraper } from "./makro.js";
import { playwrightScraper } from "./playwright.js";

const registry: Partial<Record<StoreSlug, Scraper>> = {
  checkers: new CheckersScraper(),
  shoprite: new ShopriteScraper(),
  "pick-n-pay": new PnpScraper(),
  // Registered so /api/search can be used to verify it, but STORE_CONFIGS still
  // has woolworths active: false, so the UI shows it as coming soon and will not
  // open a list against it. Which of p10/p30/p60 a shopper actually pays is not
  // yet confirmed, and an unverified price is worse than an absent store — see
  // WOOLWORTHS_PRICE_ZONE in .env.example.
  woolworths: new WoolworthsScraper(),
  // Registered so /api/search can verify it while STORE_CONFIGS keeps makro
  // active: false and the UI shows it as coming soon. Unlike Woolworths there
  // is no price-zone ambiguity, but the prices still want checking against the
  // site before shoppers see them.
  makro: new MakroScraper(),
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
