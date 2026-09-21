import type { Product } from "@accucery/types";
import type { Scraper } from "./types.js";

// Woolworths runs Constructor.io, the same search platform as Pick n Pay, so the
// request shape here is deliberately close to pnp.ts. The response is not: it
// shares value/data.id/data.image_url and nothing else. There is no priceValue,
// no priceConditionType and no promotionDisplayType, so pnp.ts normalise() scores
// 3/4 and this needs its own parser rather than an extra branch in that one.
// Probed, not assumed - see scripts/probe-woolworths-search.sh and
// docs/journal/2026-09-17-probe-before-writing-woolworths.md.
//
// Unlike Checkers and Shoprite, Woolworths serves a datacenter IP directly with
// no WAF, so this spends no ScraperAPI credits.

const SEARCH_BASE = "https://ac.cnstrc.com/search";

// Woolworths prices every product for several zones at once: p10, p30 and p60,
// which disagree on 14 of 40 products in a milk search. This is the same
// question storeContexts answers for Checkers - which branch is the shopper
// standing in - except Woolworths bakes it into the payload instead of a
// cookie.
//
// p10 IS WHAT THE SITE SHOWS AN ANONYMOUS VISITOR. Measured on 2026-09-21,
// closing issue #27: "Fresh Full Cream Ayrshire Milk 2 L" carries p10 45.99,
// p30 39.99, p60 39.99, and woolworths.co.za signed out displayed R45.99.
//
// The default used to be p60, so every price this scraper returned for a
// zone-varying product was the wrong one - R39.99 shown where the shopper
// actually pays R45.99, under-reporting the basket by R6 on that one item.
//
// This was NOT settled by the arithmetic the probe was built around. Promoted
// products turn out never to differ by zone (0/3 while 14/40 others do), so
// Woolworths prices promotions nationally and base prices regionally, and
// "Now R<x> Save R<y>" can never name a zone. See the journal for 2026-09-21.
//
// One observation, one location. If Woolworths geolocates by IP even for
// signed-out visitors, p10 is this region rather than a global default - which
// is issue #66's question, not this one. Either way p10 beats p60 for a South
// African shopper, and it stays configurable.
//
// Tried in order, so the first entry is the default when nothing is
// configured. A product not sold in a zone reports 0 there, so the rest are
// real fallbacks rather than decoration.
const ZONE_FALLBACKS = ["p10", "p30", "p60"];

/** Zones to try, most preferred first: the configured one, then the rest. */
export function zoneOrder(configured = process.env.WOOLWORTHS_PRICE_ZONE): string[] {
  const first = configured?.trim();
  if (!first) return ZONE_FALLBACKS;
  return [first, ...ZONE_FALLBACKS.filter((z) => z !== first)];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the store's response is untyped third-party JSON; every field is checked below
export function regularPrice(data: any, zones = zoneOrder()): number {
  for (const zone of zones) {
    const value = Number(data?.[zone]);
    // A zone a product is not sold in comes back as 0, not as a missing key, so
    // zero has to fall through rather than be quoted as a free product.
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

// The promotional price is not a number anywhere in the search payload. p10_wp,
// p30_wp and p60_wp looked like the obvious candidates and are 0 even on
// products the site itself flags as promoted, so they are not it. What does
// carry it is the promo array, as marketing copy: "Now R99.99 Save R27 Long
// Life Milk 6 x 1 L", against a p60 of 126.99 - and 126.99 - 27 = 99.99, so the
// two agree.
//
// Reading a price out of copy is fragile, so this refuses anything that is not
// a plain discount: the parsed value must be positive and below the regular
// price. A reworded string therefore yields no loyalty price rather than a
// wrong one, which is the same way Shoprite degrades without its cookie.
//
// product_promo_info is the only field that exists on promoted products and
// nowhere else, so it is the likelier structured home for this number. We never
// got to read it. Issue #28.
const NOW_PRICE = /\bnow\s*R\s*(\d+(?:[.,]\d{1,2})?)/i;

export function loyaltyPrice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON; promo is an array of free-text strings
  promo: any,
  regular: number
): number | null {
  const lines: unknown[] = Array.isArray(promo) ? promo : promo ? [promo] : [];
  for (const line of lines) {
    const match = NOW_PRICE.exec(String(line));
    if (!match) continue;
    const value = Number(match[1].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    // Above the regular price is not a promotion, it is a misread.
    if (regular > 0 && value >= regular) continue;
    return value;
  }
  return null;
}

// Woolworths sells clothing, beauty and homeware from the same index: "socks"
// returns 439 results, all prodtype Clothing. A shirt in a grocery price
// comparison is silently wrong rather than visibly broken, so non-food is
// dropped here. It is done client-side on purpose - prodtype is on every
// product (20/20 on both a food and a clothing query) but is NOT one of the
// facets the response advertises, so filtering on it server-side is unverified.
export function isFood(data: unknown): boolean {
  const prodtype = (data as { prodtype?: unknown } | null)?.prodtype;
  return String(prodtype ?? "").toLowerCase() === "food";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped third-party JSON, checked field by field below
export function normalise(raw: any): Product[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one element at a time
  const items: any[] = raw?.response?.results ?? [];
  const zones = zoneOrder();
  return items
    .filter((item) => isFood(item?.data))
    .slice(0, 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one element at a time
    .map((item: any): Product | null => {
      const data = item.data ?? {};
      const productId = String(data.id ?? "");
      const name = String(item.value ?? "");
      const imageUrl = String(data.image_url ?? "");
      if (!productId || !name) return null;

      const regular = regularPrice(data, zones);
      return {
        productId,
        name,
        imageUrl,
        regularPrice: regular,
        loyaltyPrice: loyaltyPrice(data.promo, regular),
      };
    })
    .filter((p): p is Product => p !== null);
}

export class WoolworthsScraper implements Scraper {
  async search(query: string): Promise<Product[]> {
    // Public client key, served to every visitor in the site's own frontend
    // bundle, exactly like Pick n Pay's. It lives in .env rather than in this
    // file only because the probe that found it never printed it back to us.
    const key = process.env.WOOLWORTHS_SEARCH_KEY;
    if (!key) {
      throw new Error(
        "WOOLWORTHS_SEARCH_KEY is not set - run scripts/probe-woolworths-search.sh and read step [1]"
      );
    }

    // Non-food is dropped after the fact, so ask for more than the 20 we keep.
    const url =
      `${SEARCH_BASE}/${encodeURIComponent(query)}` +
      `?key=${encodeURIComponent(key)}&num_results_per_page=40`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Origin": "https://www.woolworths.co.za",
        "Referer": "https://www.woolworths.co.za/",
      },
    });
    if (!res.ok) {
      throw new Error(`Woolworths API returned ${res.status} ${res.statusText}`);
    }
    return normalise(await res.json());
  }
}
