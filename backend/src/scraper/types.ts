import type { Product } from "@accucery/types";

export interface Scraper {
  search(query: string): Promise<Product[]>;
  // The Price Zone this store is currently configured for, computable without
  // a network call (an env-derived cookie hash, a preferred zone order, or a
  // constant) — #76 needs it to check the search cache before deciding
  // whether to scrape at all.
  currentZone(): string;
}
