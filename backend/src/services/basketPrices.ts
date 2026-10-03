import type { BasketPriceStatus, StoreSlug } from "@accucery/types";
import { getCachedPrices, isFresh, refreshItems } from "./priceCache.js";
import { currentZone } from "../scraper/engine.js";
import { ZONE_SCOPED_STORES } from "../scraper/branch.js";
import type { Branch } from "../scraper/types.js";

/** The zone to scope a list's price reads to, or undefined for any zone. */
export async function readZone(store: StoreSlug, branch?: Branch): Promise<string | undefined> {
  return ZONE_SCOPED_STORES.includes(store) ? currentZone(store, branch) : undefined;
}

// After an attempt that couldn't refresh a price, how long before asking
// for that list again tries once more. The list page re-asks every few
// seconds while anything is updating; without this, a product the store no
// longer returns would be re-scraped on every one of those requests.
export const RETRY_AFTER_MS = 2 * 60 * 1000;

const inFlight = new Set<string>();
const lastAttempt = new Map<string, number>();
// Keyed by zone too: two lists at different branches refresh the same
// product separately, each at its own branch.
const key = (storeSlug: string, zone: string | undefined, productId: string) =>
  `${storeSlug}\u0000${zone ?? ""}\u0000${productId}`;

export interface BasketItem {
  productId: string;
  productName: string;
  // The price stored on the list item when it was added — used only when
  // Accucery has no observed price for it at all.
  regularPrice: number;
  loyaltyPrice: number | null;
}

export interface BasketPrice {
  regularPrice: number;
  loyaltyPrice: number | null;
  observedAt: Date | null;
  status: BasketPriceStatus;
}

// Refreshed one at a time so each item stops reading as "updating" the
// moment its own price lands, not when the whole list is done.
async function refresh(storeSlug: StoreSlug, zone: string | undefined, items: BasketItem[], branch?: Branch): Promise<void> {
  for (const item of items) {
    const k = key(storeSlug, zone, item.productId);
    try {
      await refreshItems(storeSlug, [item], branch);
    } finally {
      inFlight.delete(k);
      lastAttempt.set(k, Date.now());
    }
  }
}

/**
 * Per CONTEXT.md, a list total stands on Basket Prices: each item's price
 * as last observed, refreshed when it's older than the Basket Price window
 * — never the Indicative Price window a search result is allowed. Returns
 * immediately; anything older is refreshed in the background and reported
 * as "updating" until it lands, or "outdated" if it couldn't be.
 */
export async function basketPrices(
  storeSlug: StoreSlug,
  items: BasketItem[],
  branch?: Branch
): Promise<Map<string, BasketPrice>> {
  const zone = await readZone(storeSlug, branch);
  const cached = await getCachedPrices(
    storeSlug,
    items.map((i) => i.productId),
    zone
  );
  // getCachedPrices is oldest-first, so the last row per product wins.
  const latest = new Map(cached.map((c) => [c.productId, c]));

  const prices = new Map<string, BasketPrice>();
  const toRefresh: BasketItem[] = [];

  for (const item of items) {
    const row = latest.get(item.productId);
    let status: BasketPriceStatus;
    if (row && isFresh(row.scrapedAt)) {
      status = "current";
    } else {
      const k = key(storeSlug, zone, item.productId);
      const attempted = lastAttempt.get(k);
      if (inFlight.has(k)) {
        status = "updating";
      } else if (attempted !== undefined && Date.now() - attempted < RETRY_AFTER_MS) {
        status = "outdated";
      } else {
        inFlight.add(k);
        toRefresh.push(item);
        status = "updating";
      }
    }

    prices.set(item.productId, {
      regularPrice: row ? row.regularPrice.toNumber() : item.regularPrice,
      loyaltyPrice: row ? (row.loyaltyPrice?.toNumber() ?? null) : item.loyaltyPrice,
      observedAt: row?.scrapedAt ?? null,
      status,
    });
  }

  if (toRefresh.length > 0) {
    refresh(storeSlug, zone, toRefresh, branch).catch((err) => console.error("[basket-prices] refresh failed:", err));
  }
  return prices;
}

// The latest price Accucery has observed for each item, of any age, with
// no refresh — what a total for a list that isn't open is estimated from.
export async function latestPrices(storeSlug: string, productIds: string[], zone?: string): Promise<Map<string, number>> {
  const cached = await getCachedPrices(storeSlug, productIds, zone);
  return new Map(cached.map((c) => [c.productId, c.regularPrice.toNumber()]));
}
