import type { Product } from "@accucery/types";
import type { Scraper } from "./types.js";

// Makro runs Flipkart's commerce stack - Walmart owns both Flipkart and, through
// Massmart, Makro. Probed rather than assumed: see scripts/probe-makro.sh and
// docs/journal/2026-09-17-five-forty-five.md.
//
// Unlike Checkers and Shoprite it answers a datacenter IP directly with no WAF,
// so it spends no ScraperAPI credits. The search page embeds its results as JSON
// in window.__INITIAL_STATE__, so one request is enough: /api/N/page/fetch
// returns 404 here, and there is no XHR endpoint to chase.

const SEARCH_URL = "https://www.makro.co.za/search?q=";
const STATE_MARKERS = ["__INITIAL_STATE__", "__NEXT_DATA__", "pageDataV4"];

// Flipkart nests hard. The probe found 5 products at depth 16 and 45 at depth 40
// on the same page, so this limit is evidence, not taste.
const MAX_DEPTH = 40;

/** The JSON object starting at `from`, respecting strings and escapes. */
export function balancedSlice(html: string, from: number): string | null {
  const open = html[from];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return html.slice(from, i + 1);
  }
  return null;
}

/** Every embedded state blob the page carries. */
export function extractBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];
  for (const marker of STATE_MARKERS) {
    let at = html.indexOf(marker);
    while (at !== -1) {
      const brace = html.indexOf("{", at + marker.length);
      // Only a brace that follows closely belongs to this marker; anything
      // further away is the next unrelated object in the document.
      if (brace !== -1 && brace - (at + marker.length) < 40) {
        const raw = balancedSlice(html, brace);
        if (raw) {
          try {
            blobs.push(JSON.parse(raw));
          } catch {
            // A marker inside a string literal, or a truncated page. Skip it.
          }
        }
      }
      at = html.indexOf(marker, at + marker.length);
    }
  }
  return blobs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped third-party JSON, checked field by field
function priceByType(pricing: any, wanted: string): number | null {
  const prices = Array.isArray(pricing?.prices) ? pricing.prices : [];
  for (const entry of prices) {
    if (entry?.priceType === wanted && typeof entry.value === "number") {
      return entry.value;
    }
  }
  return null;
}

// What a shopper actually pays.
//
// Makro has no loyalty programme, and its SPECIAL_PRICE is a public promotion
// rather than a card-gated one, so it is NOT mapped to loyaltyPrice: the
// frontend only applies loyaltyPrice when the shopper has enabled loyalty for a
// store, and Settings only lists stores whose loyaltyProgramme is set. Quoting
// the effective price as regularPrice keeps the basket total right however that
// toggle is set.
//
// finalPrice is deliberately unused. It is named "Total" with priceType TOTAL
// and sits beside a deliveryCharge block, so on a product with delivery it may
// not be the shelf price. prices[] by priceType says what each number is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON
export function effectivePrice(pricing: any): number {
  const special = priceByType(pricing, "SPECIAL_PRICE");
  if (special !== null && special > 0) return special;
  const selling = priceByType(pricing, "FSP");
  if (selling !== null && selling > 0) return selling;
  const mrp = pricing?.mrp?.value;
  return typeof mrp === "number" && mrp > 0 ? mrp : 0;
}

// Two widget shapes carry the title differently: renderableComponents puts it at
// value.title, the products widget nests it at titles.title. Accepting only the
// first found 5 products where there were 45.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON
export function titleOf(node: any): string {
  if (typeof node?.title === "string" && node.title) return node.title;
  const nested = node?.titles?.title;
  return typeof nested === "string" ? nested : "";
}

/** Walk the whole blob collecting anything shaped like a product. */
export function collectProducts(blob: unknown): Product[] {
  const byId = new Map<string, Product>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON
  const visit = (node: any, depth: number): void => {
    if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }

    const productId = String(node.productId ?? node.itemId ?? "");
    const name = titleOf(node);
    const pricing = node.pricing;
    if (productId && name && pricing && typeof pricing === "object") {
      const regularPrice = effectivePrice(pricing);
      // A product with no readable price cannot be compared, so it is dropped
      // rather than shown at zero.
      if (regularPrice > 0 && !byId.has(productId)) {
        byId.set(productId, {
          productId,
          name,
          imageUrl: typeof node.imageUrl === "string" ? node.imageUrl : "",
          regularPrice,
          loyaltyPrice: null,
        });
      }
    }

    for (const value of Object.values(node)) visit(value, depth + 1);
  };

  visit(blob, 0);
  return [...byId.values()];
}

export function normalise(html: string): Product[] {
  const byId = new Map<string, Product>();
  for (const blob of extractBlobs(html)) {
    for (const product of collectProducts(blob)) {
      if (!byId.has(product.productId)) byId.set(product.productId, product);
    }
  }
  return [...byId.values()].slice(0, 20);
}

export class MakroScraper implements Scraper {
  async search(query: string): Promise<Product[]> {
    const res = await fetch(`${SEARCH_URL}${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Accept-Language": "en-ZA,en;q=0.9",
        "Referer": "https://www.makro.co.za/",
      },
    });
    if (!res.ok) {
      throw new Error(`Makro returned ${res.status} ${res.statusText}`);
    }
    return normalise(await res.text());
  }
}
