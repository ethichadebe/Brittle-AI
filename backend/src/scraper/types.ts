import type { Product } from "@accucery/types";

/**
 * The branch a list is priced at (#131). `name` is for the shopper; the rest
 * is whatever that store's scraper needs to ask for it, opaque to everyone
 * else. Saved on the list, so it is plain JSON.
 */
export interface Branch {
  name: string;
  [detail: string]: unknown;
}

/** Where to find a branch. Used once and discarded, never stored (POPIA). */
export interface Place {
  latitude: number;
  longitude: number;
}

export interface Scraper {
  // Without a branch, the store's default (Joburg for Checkers and Shoprite).
  search(query: string, branch?: Branch): Promise<Product[]>;
  // The Price Zone this store is currently configured for — #76 needs it to
  // check the search cache before deciding whether to scrape at all. Usually
  // a constant or a preferred zone order; Checkers and Shoprite look their
  // branch up from the site, at most every few hours (#66), so it may wait.
  currentZone(branch?: Branch): string | Promise<string>;
  // The branch nearest a place, or null when the store has none to offer
  // there. Only stores that price by branch implement it.
  nearestBranch?(place: Place): Promise<Branch | null>;
}
