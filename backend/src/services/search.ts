import type { Product, StoreSlug } from "@accucery/types";
import { searchProducts, currentZone } from "../scraper/engine.js";
import { ZONE_SCOPED_STORES } from "../scraper/branch.js";
import type { Branch } from "../scraper/types.js";
import { getCachedSearch, upsertSearch } from "./searchCache.js";
import { getCachedPrices, upsertCache } from "./priceCache.js";

// A cache hit's row order is the store's own ranking, which a database
// query has no reason to preserve — reordering here is what keeps a
// database-order regression from being invisible.
async function hydrate(storeSlug: string, productIds: string[], zone?: string): Promise<Product[]> {
  const rows = await getCachedPrices(storeSlug, productIds, zone);
  const byId = new Map(rows.map((r) => [r.productId, r]));
  return productIds
    .map((id): Product | null => {
      const row = byId.get(id);
      if (!row) return null;
      return {
        productId: row.productId,
        name: row.productName,
        imageUrl: row.imageUrl,
        zone: row.zone,
        regularPrice: row.regularPrice.toNumber(),
        loyaltyPrice: row.loyaltyPrice?.toNumber() ?? null,
      };
    })
    .filter((p): p is Product => p !== null);
}

// The one place a store gets searched — /search and #89's item matching
// both go through this, so a repeat lookup for either never re-scrapes.
// A list's branch (#131) is searched as that branch; without one, the
// store's default.
export async function search(storeSlug: StoreSlug, query: string, branch?: Branch): Promise<Product[]> {
  const zone = await currentZone(storeSlug, branch);

  const cachedSearch = await getCachedSearch(storeSlug, zone, query);
  if (cachedSearch) {
    return hydrate(storeSlug, cachedSearch.productIds, ZONE_SCOPED_STORES.includes(storeSlug) ? zone : undefined);
  }

  const products = await searchProducts(storeSlug, query, branch);
  if (products.length > 0) {
    await Promise.all(
      products.map((p) =>
        upsertCache({
          storeSlug,
          productId: p.productId,
          productName: p.name,
          imageUrl: p.imageUrl,
          zone: p.zone,
          regularPrice: p.regularPrice,
          loyaltyPrice: p.loyaltyPrice,
        })
      )
    );
    // Remembered as this zone's answer only if it is one: the Playwright
    // fallback prices at no particular branch, and a cache entry claiming
    // otherwise would be read back as this branch's prices.
    if (products.every((p) => p.zone === zone)) {
      await upsertSearch({
        storeSlug,
        zone,
        query,
        productIds: products.map((p) => p.productId),
      });
    }
  }
  return products;
}
