import { prisma } from "../db.js";
import { searchProducts } from "../scraper/engine.js";
import type { Branch } from "../scraper/types.js";
import type { StoreSlug } from "@accucery/types";
import { CREDIT_STORES, CreditBudgetSpent } from "../scraper/creditBudget.js";

export const TTL_MS = 60 * 60 * 1000; // 1 hour
// #157 (decided with the owner): a list item at a store that costs ScraperAPI
// credits is re-priced at most once a day. Prices there move with weekly
// specials, not by the hour.
export const CREDIT_STORE_TTL_MS = 24 * 60 * 60 * 1000;

export function isFresh(scrapedAt: Date, storeSlug?: string): boolean {
  const ttl = storeSlug && CREDIT_STORES.includes(storeSlug) ? CREDIT_STORE_TTL_MS : TTL_MS;
  return Date.now() - scrapedAt.getTime() < ttl;
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
      // Every price the search returned, not only the one asked for (#157):
      // they cost the same request, and the next refresh may need them.
      for (const p of results) {
        await upsertCache({
          storeSlug,
          productId: p.productId,
          productName: p.name,
          imageUrl: p.imageUrl,
          zone: p.zone,
          regularPrice: p.regularPrice,
          loyaltyPrice: p.loyaltyPrice,
        });
      }
    } catch (err) {
      // Today's allowance is gone: stop, rather than fail every item in turn.
      if (err instanceof CreditBudgetSpent) throw err;
      console.error(`[price-cache] refresh failed for ${item.productId}:`, err);
    }
  }
}
