import type { FastifyInstance } from "fastify";
import type { Product, SearchResponse, StoreSlug } from "@accucery/types";
import { searchProducts, currentZone } from "../scraper/engine.js";
import { getCachedSearch, upsertSearch } from "../services/searchCache.js";
import { getCachedPrices, upsertCache } from "../services/priceCache.js";

// A cache hit's row order is the store's own ranking, which a database
// query has no reason to preserve — reordering here is what keeps a
// database-order regression from being invisible.
async function hydrate(storeSlug: string, productIds: string[]): Promise<Product[]> {
  const rows = await getCachedPrices(storeSlug, productIds);
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

export async function searchRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { store: string; q: string };
    Reply: SearchResponse;
  }>("/search", async (req, reply) => {
    const { store, q } = req.query;
    if (!q?.trim()) return reply.send({ products: [] });
    const storeSlug = store as StoreSlug;
    const query = q.trim();
    const zone = currentZone(storeSlug);

    const cachedSearch = await getCachedSearch(storeSlug, zone, query);
    if (cachedSearch) {
      const products = await hydrate(storeSlug, cachedSearch.productIds);
      return reply.send({ products });
    }

    const products = await searchProducts(storeSlug, query);
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
      await upsertSearch({
        storeSlug,
        zone,
        query,
        productIds: products.map((p) => p.productId),
      });
    }
    return reply.send({ products });
  });
}
