import type { Product } from "@accucery/types";
import type { Branch, Scraper } from "./types.js";
import { opaqueZone } from "./zone.js";
import { remember } from "./remember.js";

// Pick n Pay, priced at a real store (#132).
//
// Until #132 this asked Constructor (ac.cnstrc.com), the site's autocomplete
// and tracking service, which knows no store: its prices were nobody's. The
// site's own results come from its own search, which takes a storeCode, and
// prices differ by store - 10 of 18 milks between Benmore and Constantia on
// the probe run of 2026-10-03 (#132). That probe also showed this answers
// plain requests from the VPS, so no ScraperAPI and no credits.
//
// A store code comes from the chain the site uses (#66): an anonymous cart
// starts at a default store (Constantia, WC21), an address moves it to the
// store that serves the address, and the cart says which.

const ORIGIN = "https://www.pnp.co.za";
const BASE = "/pnphybris/v2/pnp-spa";
const FIELDS = "products(code,name,price(FULL),images(DEFAULT),potentialPromotions(FULL),stock(FULL),available)";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
  // The site's own anonymous requests carry these; without them it refuses.
  "x-anonymous-consents": "%5B%5D",
  "x-pnp-cache-key": "anonymous",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the store's response is untyped third-party JSON; the shape is checked field by field
async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: HEADERS,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`PnP API returned ${res.status} ${res.statusText}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Where a cart is delivered to: the site refuses an address without a street. */
export interface PnpAddress {
  street: string;
  town: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

/** The default store's address: Sandton, as for Checkers and Shoprite (#66). Pick n Pay gives it Benmore (GC13). */
export const DEFAULT_ADDRESS: PnpAddress = {
  street: "Rivonia Road",
  town: "Sandton",
  postalCode: "2196",
  latitude: -26.1076,
  longitude: 28.0567,
};

/** The store that serves an address, by the site's own cart. */
export async function storeFor(address: PnpAddress): Promise<{ code: string; name: string }> {
  const cart = await call("POST", `${BASE}/users/anonymous/carts?fields=DEFAULT&lang=en&curr=ZAR`, {});
  if (typeof cart?.guid !== "string") throw new Error("PnP gave no cart");
  await call("POST", `${BASE}/users/anonymous/carts/${encodeURIComponent(cart.guid)}/addresses/delivery?lang=en&curr=ZAR`, {
    streetnumber: "1",
    streetname: address.street,
    district: address.town,
    town: address.town,
    postalCode: address.postalCode,
    latitude: address.latitude,
    longitude: address.longitude,
    country: { isocode: "ZA" },
    defaultAddress: false,
    line2: `1 ${address.street}`,
  });
  const assigned = await call("GET", `${BASE}/users/anonymous/carts/${encodeURIComponent(cart.guid)}?fields=DEFAULT&lang=en&curr=ZAR`);
  const code = assigned?.baseStore?.uid;
  if (typeof code !== "string" || !code) throw new Error("PnP assigned the cart no store");
  return { code, name: String(assigned.baseStore.displayName ?? code) };
}

// The default store, remembered as Checkers' and Shoprite's are (remember.ts).
// A failed lookup searches with no store code, which the site prices at its
// own default, and the zone then says "unconfigured".
const BRANCH_TTL_MS = 6 * 60 * 60 * 1000;
const FAILED_TTL_MS = 5 * 60 * 1000;
const defaultStore = remember<{ code: string; name: string } | null>("Pick n Pay", () => storeFor(DEFAULT_ADDRESS), null, {
  ttlMs: BRANCH_TTL_MS,
  failedTtlMs: FAILED_TTL_MS,
});

/** Tests only: start with no remembered store. */
export function forgetDefaultStore(): void {
  defaultStore.forget();
}

/** Started with the server, so the first shopper doesn't wait for a lookup. */
export function warmDefaultStore(): void {
  void defaultStore.get();
}

/** A list's branch at Pick n Pay carries the site's store code. */
function storeCodeOf(branch: Branch | undefined): string | null {
  return typeof branch?.storeCode === "string" && branch.storeCode ? branch.storeCode : null;
}

/**
 * A Smart Shopper price, from a promotion the API sends as text. Only a bare
 * price ("R89.99 ") is read: a message like "2 for R50" is a deal on a
 * basket, not what one unit costs (CONTEXT.md: a Conditional Price), and a
 * promotion outside its dates isn't on. The API's own `valid` flag is false
 * even on a running promotion for a signed-out cart, so dates decide.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped third-party JSON, read field by field
export function smartShopperPrice(promotions: any, now = new Date()): number | null {
  if (!Array.isArray(promotions)) return null;
  for (const promo of promotions) {
    if (promo?.promotionDisplayType !== "SMART_SHOPPER") continue;
    const start = promo.startDate ? new Date(promo.startDate) : null;
    const end = promo.endDate ? new Date(promo.endDate) : null;
    if ((start && start > now) || (end && end < now)) continue;
    const m = String(promo.promotionTextMessage ?? "").match(/^\s*R\s*(\d+(?:[.,]\d{1,2})?)\s*$/);
    if (m) return Number(m[1].replace(",", "."));
  }
  return null;
}

// The zone is attached in search(), not here, so normalise() stays a pure
// function of the response body, as the other scrapers' are.
type UnzonedProduct = Omit<Product, "zone">;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped third-party JSON, read field by field
export function normalise(raw: any, now = new Date()): UnzonedProduct[] {
  const items: unknown[] = Array.isArray(raw?.products) ? raw.products : [];
  return (
    items
      .slice(0, 20)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one product at a time
      .map((p: any): UnzonedProduct | null => {
        const productId = String(p?.code ?? "");
        const name = String(p?.name ?? "");
        const regularPrice = Number(p?.price?.value);
        if (!productId || !name || !Number.isFinite(regularPrice) || regularPrice <= 0) return null;
        // "product" is the larger picture; "thumbnail" is 96px.
        const images: { format?: string; url?: string }[] = Array.isArray(p.images) ? p.images : [];
        const imageUrl = String((images.find((i) => i.format === "product") ?? images[0])?.url ?? "");
        const card = smartShopperPrice(p.potentialPromotions, now);
        return { productId, name, imageUrl, regularPrice, loyaltyPrice: card !== null && card < regularPrice ? card : null };
      })
      .filter((p): p is UnzonedProduct => p !== null)
  );
}

export class PnpScraper implements Scraper {
  // A list's own store (#135), or the default - one lookup every few hours,
  // far cheaper than the scrape a cache check exists to avoid.
  async currentZone(branch?: Branch): Promise<string> {
    return opaqueZone(storeCodeOf(branch) ?? (await defaultStore.get())?.code ?? "");
  }

  async search(query: string, branch?: Branch): Promise<Product[]> {
    const code = storeCodeOf(branch) ?? (await defaultStore.get())?.code ?? null;
    const json = await call(
      "POST",
      `${BASE}/products/search?fields=${encodeURIComponent(FIELDS)}&query=${encodeURIComponent(query)}&pageSize=20${
        code ? `&storeCode=${encodeURIComponent(code)}` : ""
      }&lang=en&curr=ZAR`,
      {}
    );
    const zone = opaqueZone(code ?? "");
    return normalise(json).map((p) => ({ ...p, zone }));
  }
}
