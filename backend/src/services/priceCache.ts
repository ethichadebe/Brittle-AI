import { prisma } from "../db.js";
import { searchProducts } from "../scraper/engine.js";
import type { StoreSlug } from "@accucery/types";

export const TTL_MS = 60 * 60 * 1000; // 1 hour

export function isFresh(scrapedAt: Date): boolean {
  return Date.now() - scrapedAt.getTime() < TTL_MS;
}

export async function getCachedPrices(storeSlug: string, productIds: string[]) {
  if (productIds.length === 0) return [];
  return prisma.priceCache.findMany({
    where: { storeSlug, productId: { in: productIds } },
  });
}

export async function upsertCache(entry: {
  storeSlug: string;
  productId: string;
  productName: string;
  regularPrice: number;
  loyaltyPrice: number | null;
}) {
  await prisma.priceCache.upsert({
    where: { storeSlug_productId: { storeSlug: entry.storeSlug, productId: entry.productId } },
    update: {
      regularPrice: entry.regularPrice,
      loyaltyPrice: entry.loyaltyPrice,
      scrapedAt: new Date(),
    },
    create: { ...entry, scrapedAt: new Date() },
  });
}

export async function refreshItems(
  storeSlug: StoreSlug,
  items: { productId: string; productName: string }[]
): Promise<void> {
  for (const item of items) {
    try {
      const results = await searchProducts(storeSlug, item.productName);
      const match = results.find((p) => p.productId === item.productId);
      if (match) {
        await upsertCache({
          storeSlug,
          productId: match.productId,
          productName: match.name,
          regularPrice: match.regularPrice,
          loyaltyPrice: match.loyaltyPrice,
        });
      }
    } catch (err) {
      console.error(`[price-cache] refresh failed for ${item.productId}:`, err);
    }
  }
}

export function refreshInBackground(
  storeSlug: StoreSlug,
  items: { productId: string; productName: string }[]
): void {
  refreshItems(storeSlug, items).catch(console.error);
}
