import type { Product, StoreSlug } from "@accucery/types";
import type { Scraper } from "./types.js";
import { CheckersScraper } from "./checkers.js";

const registry: Partial<Record<StoreSlug, Scraper>> = {
  checkers: new CheckersScraper(),
};

export async function searchProducts(
  store: StoreSlug,
  query: string
): Promise<Product[]> {
  const scraper = registry[store];
  if (!scraper) return [];
  try {
    return await scraper.search(query);
  } catch (err) {
    console.error(`[scraper:${store}] search failed:`, err);
    return [];
  }
}
