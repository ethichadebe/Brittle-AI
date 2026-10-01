import type { FastifyInstance } from "fastify";
import { STORE_CONFIGS } from "@accucery/types";
import type { RecentProductsResponse, StoreSlug } from "@accucery/types";
import { prisma } from "../db.js";
import { ownerKey } from "../listOwnership.js";
import { getCachedPrices } from "../services/priceCache.js";

// How many products Recent offers, and how many list rows are read to find
// them — enough history for a regular shopper, without reading it all.
export const RECENT_PRODUCTS_LIMIT = 30;
const ROWS_SCANNED = 500;

export async function recentProductsRoutes(app: FastifyInstance) {
  // GET /recent-products?store= — products this Shopper has had on their
  // lists at that store, most recently added first, each product once (#114).
  // Read from the lists the Shopper has now: a deleted list's items are gone.
  app.get<{ Querystring: { store?: string }; Reply: RecentProductsResponse }>(
    "/recent-products",
    async (req, reply) => {
      const store = STORE_CONFIGS.find((s) => s.slug === req.query.store)?.slug as StoreSlug | undefined;
      if (!store) return reply.status(400).send({ error: "store must be a known store" } as never);

      const rows = await prisma.listItem.findMany({
        where: { list: { userId: ownerKey(req), storeSlug: store } },
        orderBy: { createdAt: "desc" },
        take: ROWS_SCANNED,
      });

      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (!latest.has(row.productId)) latest.set(row.productId, row);
        if (latest.size === RECENT_PRODUCTS_LIMIT) break;
      }

      // The latest price seen beats the one stored when it was added, which
      // never moves. Oldest-first, so the Map keeps the freshest per product.
      const cached = new Map(
        (await getCachedPrices(store, [...latest.keys()])).map((c) => [c.productId, c] as const)
      );

      return {
        products: [...latest.values()].map((row) => {
          const price = cached.get(row.productId);
          return {
            productId: row.productId,
            name: row.productName,
            imageUrl: row.imageUrl,
            regularPrice: (price?.regularPrice ?? row.regularPrice).toNumber(),
            loyaltyPrice: (price ? price.loyaltyPrice : row.loyaltyPrice)?.toNumber() ?? null,
            lastAddedAt: row.createdAt.toISOString(),
          };
        }),
      };
    }
  );
}
