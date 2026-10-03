import { prisma } from "../db.js";
import { searchProducts } from "../scraper/engine.js";
import type { Branch } from "../scraper/types.js";
import type { StoreSlug } from "@accucery/types";

export const TTL_MS = 60 * 60 * 1000; // 1 hour

export function isFresh(scrapedAt: Date): boolean {
  return Date.now() - scrapedAt.getTime() < TTL_MS;
}

// With a zone, only that zone's prices: a list priced at one branch must
// not show a price another list's branch was charged (#131).
export async function getCachedPrices(storeSlug: string, productIds: string[], zone?: string) {
  if (productIds.length === 0) return [];
  // A product can briefly have rows in more than one zone (the cookie or
  // Woolworths preference just changed, and the old zone's row hasn't
  // expired yet). Ordering oldest-first and keying a Map by productId means
  // whichever the caller's own iteration keeps is the freshest one.
  return prisma.priceCache.findMany({
    where: { storeSlug, productId: { in: productIds }, ...(zone !== undefined && { zone }) },
    orderBy: { scrapedAt: "asc" },
  });
}

export async function upsertCache(entry: {
  storeSlug: string;
  productId: string;
  productName: string;
  imageUrl: string;
  zone: string;
  regularPrice: number;
  loyaltyPrice: number | null;
}) {
  await prisma.priceCache.upsert({
    where: {
      storeSlug_productId_zone: {
        storeSlug: entry.storeSlug,
        productId: entry.productId,
        zone: entry.zone,
      },
    },
    update: {
      productName: entry.productName,
      imageUrl: entry.imageUrl,
      regularPrice: entry.regularPrice,
      loyaltyPrice: entry.loyaltyPrice,
      scrapedAt: new Date(),
    },
    create: { ...entry, scrapedAt: new Date() },
  });
}

export async function refreshItems(
  storeSlug: StoreSlug,
  items: { productId: string; productName: string }[],
  branch?: Branch
): Promise<void> {
  for (const item of items) {
    try {
      const results = await searchProducts(storeSlug, item.productName, branch);
      const match = results.find((p) => p.productId === item.productId);
      if (match) {
        await upsertCache({
          storeSlug,
          productId: match.productId,
          productName: match.name,
          imageUrl: match.imageUrl,
          zone: match.zone,
          regularPrice: match.regularPrice,
          loyaltyPrice: match.loyaltyPrice,
        });
      }
    } catch (err) {
      console.error(`[price-cache] refresh failed for ${item.productId}:`, err);
    }
  }
}
