import { prisma } from "../db.js";
import { CREDIT_STORES } from "../scraper/credits.js";

// Per CONTEXT.md: an Indicative Price is "the most recent one Accucery
// observed, which may be up to a day old". This is the window that governs
// a search result, not price_cache's own (much shorter) freshness — a
// search cache hit is served from whatever price_cache holds regardless of
// that table's own TTL, because this window is the one doing the promising.
export const TTL_MS = 24 * 60 * 60 * 1000;
// #157 (decided with the owner): at a store that costs ScraperAPI credits, a
// search is reused for 3 days before it's paid for again.
export const CREDIT_STORE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export function isFresh(scrapedAt: Date, storeSlug?: string): boolean {
  const ttl = storeSlug && CREDIT_STORES.includes(storeSlug) ? CREDIT_STORE_TTL_MS : TTL_MS;
  return Date.now() - scrapedAt.getTime() < ttl;
}

// Milk, milk and milk (trailing space) must be one row — a name-keyed table
// that treated them as different rows could never guarantee completeness.
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getCachedSearch(storeSlug: string, zone: string, query: string) {
  const row = await prisma.searchCache.findUnique({
    where: {
      storeSlug_zone_query: { storeSlug, zone, query: normaliseQuery(query) },
    },
  });
  if (!row || !isFresh(row.scrapedAt, storeSlug)) return null;
  return row;
}

export async function upsertSearch(entry: {
  storeSlug: string;
  zone: string;
  query: string;
  productIds: string[];
}) {
  const query = normaliseQuery(entry.query);
  await prisma.searchCache.upsert({
    where: { storeSlug_zone_query: { storeSlug: entry.storeSlug, zone: entry.zone, query } },
    update: { productIds: entry.productIds, scrapedAt: new Date() },
    create: {
      storeSlug: entry.storeSlug,
      zone: entry.zone,
      query,
      productIds: entry.productIds,
      scrapedAt: new Date(),
    },
  });
}
