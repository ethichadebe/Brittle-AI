import type { Product } from "@accucery/types";
import type { Scraper } from "./types.js";

const SEARCH_BASE = "https://ac.cnstrc.com/search";
// Public API key embedded in pnp.co.za frontend JS
const API_KEY = "key_yMuER1c8l84k40e3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(raw: any): Product[] {
  const items: any[] = raw?.response?.results ?? [];
  return items
    .slice(0, 20)
    .map((item: any): Product | null => {
      const data = item.data ?? {};
      const productId = String(data.id ?? "");
      const name = String(item.value ?? "");
      const imageUrl = String(data.image_url ?? "");
      if (!productId || !name) return null;

      let regularPrice = Number(data.priceValue ?? 0);
      let loyaltyPrice: number | null = null;

      if (
        data.priceConditionType === "PROMOTION" &&
        data.promotionDisplayType === "SMART_SHOPPER"
      ) {
        // Main entry is already the Smart Shopper promo price
        loyaltyPrice = Number(data.priceValue);
        regularPrice = Number(data.oldPriceValue ?? data.priceValue);
      } else {
        // Look for a Smart Shopper variation (different store's promo price)
        const ssVariation = (item.variations ?? []).find(
          (v: any) =>
            v.data?.priceConditionType === "PROMOTION" &&
            v.data?.promotionDisplayType === "SMART_SHOPPER"
        );
        if (ssVariation) {
          loyaltyPrice = Number(ssVariation.data.priceValue);
          if (ssVariation.data.oldPriceValue != null) {
            regularPrice = Number(ssVariation.data.oldPriceValue);
          }
        }
      }

      return { productId, name, imageUrl, regularPrice, loyaltyPrice };
    })
    .filter((p): p is Product => p !== null);
}

export class PnpScraper implements Scraper {
  async search(query: string): Promise<Product[]> {
    const url = `${SEARCH_BASE}/${encodeURIComponent(query)}?key=${API_KEY}&num_results_per_page=20`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Origin": "https://www.pnp.co.za",
        "Referer": "https://www.pnp.co.za/",
      },
    });
    if (!res.ok) {
      throw new Error(`PnP API returned ${res.status} ${res.statusText}`);
    }
    return normalise(await res.json());
  }
}
