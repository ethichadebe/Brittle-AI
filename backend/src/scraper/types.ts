import type { Product } from "@accucery/types";

export interface Scraper {
  search(query: string): Promise<Product[]>;
  // The Price Zone this store is currently configured for — #76 needs it to
  // check the search cache before deciding whether to scrape at all. Usually
  // a constant or a preferred zone order; Checkers and Shoprite look their
  // branch up from the site, at most every few hours (#66), so it may wait.
  currentZone(): string | Promise<string>;
}
