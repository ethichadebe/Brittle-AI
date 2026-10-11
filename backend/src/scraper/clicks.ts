import type { Product } from "@accucery/types";
import type { Scraper } from "./types.js";
import { NO_ZONE } from "./zone.js";

// Clicks (#164). Its site search is Algolia, and the Algolia app ID and
// search-only key are served to every visitor in the site's own JavaScript,
// like Pick n Pay's Constructor key. So a search is one free JSON request:
// no WAF, no ScraperAPI credits. Probed from a cloud session and from the
// VPS before this was written: scripts/probe-clicks-dischem.mjs, #165.
//
// The key is read from Clicks' bundle when it's first needed, never stored
// in this repo: it would trip the secrets scan, and Clicks can rotate it.
// The bundle also carries an older key in a comment, so every pair found is
// tried and the first that searches is kept.

const ORIGIN = "https://clicks.co.za";
const BUNDLE_PATH = "/_ui/desktop/theme-blue/clicks/algoliaCombined.js";
// Named on every page in a hidden input; this is what it said on 2026-10-11.
const DEFAULT_INDEX = "Prod_ProductIndex";
// A day: the bundle is 1.5MB, and a rotated key is noticed sooner anyway,
// because Algolia refuses it and that drops what's remembered.
const CREDENTIALS_TTL_MS = 24 * 60 * 60 * 1000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export interface AlgoliaCredentials {
  app: string;
  key: string;
}

/**
 * Every (app, key) pair the bundle hands to an Algolia client, in order.
 * Webpack ships modules inside eval strings, so the whitespace between the
 * arguments may be real or written out as \r\n and \t.
 */
export function algoliaCredentials(js: string): AlgoliaCredentials[] {
  const gap = String.raw`(?:\s|\\[rnt])*`;
  const re = new RegExp(String.raw`\(${gap}['"]([A-Z0-9]{10})['"]${gap},${gap}['"]([0-9a-f]{32})['"]`, "g");
  const seen = new Set<string>();
  const out: AlgoliaCredentials[] = [];
  for (const m of js.matchAll(re)) {
    const id = `${m[1]}:${m[2]}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ app: m[1], key: m[2] });
    }
  }
  return out;
}

/** The product index a Clicks page names, or the one it named when this was written. */
export function productIndex(html: string): string {
  return html.match(/value="([^"]+)"\s+id="algoliaProductIndex"/)?.[1] || DEFAULT_INDEX;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const AMOUNT = String.raw`R?\s*(\d+(?:[.,]\d{1,2})?)`;
const amount = (s: string) => Number(s.replace(",", "."));

// Clicks says what a promotion is only in its wording, so these read it.
// Checked against 160 promoted products on 2026-10-11 (nappies, coffee,
// shampoo, dishwashing liquid, toothpaste, milk).
//
// ClubCard only: "Clubcard Members Only, Huggies ... Now 199.99 per pack."
const CARD_ONLY = /club\s*card\s+members?\s+only/i;
// ClubCard on top of the shelf price: "New lower prices. ClubCard customers
// instantly get 10% off."
const CARD_PERCENT = /club\s*card\s+(?:customers|members)\b[^.]*?(\d{1,2})\s*%\s*off/i;
// Online only: not what the shelf in a store charges.
const ONLINE_ONLY = /online\s+only/i;
// A multi-buy that also prices one: "Buy 2 for 130 per pack Or 1 for 169 per
// pack". The single price is what one costs.
const ONE_FOR = new RegExp(String.raw`\bor\s+1\s+for\s+${AMOUNT}`, "i");
// A multi-buy that doesn't: "Buy any 3, cheapest free", "2 For 170", "3F2".
// A Conditional Price (CONTEXT.md), not a unit price, so it changes nothing.
const CONDITIONAL = /\b(?:buy\s+(?:any\s+)?\d+|\d+\s*for\s*R?\s*\d|\d+\s*f\s*\d|cheapest|per\s+offer)/i;
// A plain new price: "Huggies ... Now 189.99 per pack."
const NOW = new RegExp(String.raw`\bnow\s+${AMOUNT}`, "i");

/** One promotion's text, without the "~id~TYPE" Clicks appends. */
const wording = (description: unknown) => String(description ?? "").split("~")[0];

/**
 * What one costs, and what it costs with a ClubCard.
 *
 * promoWithAppliedGrossPriceValue is Algolia's own "promo price", but it
 * can't be taken as it is: on "Buy 2 for 130 or 1 for 169" it says 130, a
 * price one item never costs, and on a ClubCard-only deal it says the card
 * price. So the wording decides, and the number is used only for a plain
 * public promotion whose wording gives no price ("30% Off Revlon Lips").
 */
export function prices(
  price: number,
  promoValue: number | null,
  descriptions: unknown[]
): { regularPrice: number; loyaltyPrice: number | null } {
  let regular = price;
  let card: number | null = null;
  let cardPercent = 0;
  const lower = (current: number | null, value: number) =>
    Number.isFinite(value) && value > 0 && (current === null || value < current) ? value : current;

  const texts = descriptions.map(wording).filter(Boolean);
  const cardGated = texts.some((t) => CARD_ONLY.test(t));

  for (const text of texts) {
    if (CARD_ONLY.test(text)) {
      const now = NOW.exec(text);
      card = lower(card, now ? amount(now[1]) : promoValue ?? NaN);
      continue;
    }
    const percent = CARD_PERCENT.exec(text);
    if (percent) {
      cardPercent = Math.max(cardPercent, Number(percent[1]));
      continue;
    }
    if (ONLINE_ONLY.test(text)) continue;
    const one = ONE_FOR.exec(text);
    if (one) {
      regular = lower(regular, amount(one[1])) ?? regular;
      continue;
    }
    if (CONDITIONAL.test(text)) continue;
    const now = NOW.exec(text);
    if (now) {
      regular = lower(regular, amount(now[1])) ?? regular;
      continue;
    }
    // A public promotion with no price in its words. The number is only
    // trusted when nothing on this product is ClubCard-only, because then it
    // could be the card price instead.
    if (!cardGated && promoValue !== null) regular = lower(regular, promoValue) ?? regular;
  }

  // The card's percentage is taken off the shelf price only. Whether Clicks
  // stacks it on another promotion isn't known, and claiming a saving that
  // isn't there is worse than missing one.
  if (cardPercent > 0 && regular === price) card = lower(card, price * (1 - cardPercent / 100));
  regular = round2(regular);
  const loyaltyPrice = card !== null && round2(card) < regular ? round2(card) : null;
  return { regularPrice: regular, loyaltyPrice };
}

/** Clicks' image paths are relative to its own site. */
export function imageUrlOf(path: unknown): string {
  const s = typeof path === "string" ? path : "";
  if (!s) return "";
  if (/^https?:\/\//.test(s)) return s;
  return s.startsWith("/") ? `${ORIGIN}${s}` : "";
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped third-party JSON, read field by field
export function normalise(raw: any): Product[] {
  const hits: unknown[] = Array.isArray(raw?.hits) ? raw.hits : [];
  const out: Product[] = [];
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped JSON, one hit at a time
  for (const h of hits as any[]) {
    const productId = String(h?.objectID ?? h?.baseProductCode ?? "");
    const name = String(h?.brandWithProductName || `${h?.brandName ?? ""} ${h?.productName ?? ""}`)
      .replace(/\s+/g, " ")
      .trim();
    const price = num(h?.price);
    // Without a price it can't be compared, so it's left out rather than shown at zero.
    if (!productId || !name || price === null || seen.has(productId)) continue;
    seen.add(productId);
    const descriptions: unknown[] = Array.isArray(h.promoDescriptions) ? h.promoDescriptions : [];
    out.push({
      productId,
      name,
      imageUrl: imageUrlOf(h.img300Wx300H ?? h.img180Wx180H),
      // One national price: Clicks has no branch pricing online.
      zone: NO_ZONE,
      ...prices(price, num(h.promoWithAppliedGrossPriceValue), descriptions),
    });
  }
  return out.slice(0, 20);
}

type Fetch = typeof fetch;

export class ClicksScraper implements Scraper {
  private found: { credentials: AlgoliaCredentials[]; index: string; until: number } | null = null;
  private working: AlgoliaCredentials | null = null;

  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  currentZone(): string {
    return NO_ZONE;
  }

  /** Tests only. */
  forget(): void {
    this.found = null;
    this.working = null;
  }

  private async get(path: string): Promise<string> {
    const res = await this.fetchImpl(`${ORIGIN}${path}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-ZA,en;q=0.9" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Clicks returned ${res.status} for ${path}`);
    return res.text();
  }

  private async credentials() {
    if (this.found && this.found.until > Date.now()) return this.found;
    const [home, bundle] = await Promise.all([this.get("/").catch(() => ""), this.get(BUNDLE_PATH)]);
    const credentials = algoliaCredentials(bundle);
    if (!credentials.length) throw new Error("Clicks: no Algolia key in its bundle; it has moved or changed shape");
    this.found = { credentials, index: productIndex(home), until: Date.now() + CREDENTIALS_TTL_MS };
    this.working = null;
    return this.found;
  }

  private query(c: AlgoliaCredentials, index: string, query: string) {
    return this.fetchImpl(`https://${c.app}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/query`, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": c.app,
        "X-Algolia-API-Key": c.key,
        "Content-Type": "application/json",
        "User-Agent": UA,
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
      },
      body: JSON.stringify({ params: `query=${encodeURIComponent(query)}&hitsPerPage=20` }),
      signal: AbortSignal.timeout(30000),
    });
  }

  async search(query: string): Promise<Product[]> {
    // Twice at most: a refused key may mean Clicks rotated it, so the bundle
    // is read again once before giving up.
    for (let round = 0; round < 2; round++) {
      const { credentials, index } = await this.credentials();
      const tries = this.working ? [this.working] : credentials;
      let lastStatus = 0;
      for (const c of tries) {
        const res = await this.query(c, index, query);
        if (res.ok) {
          this.working = c;
          return normalise(await res.json());
        }
        lastStatus = res.status;
        // Anything but a refused key is Algolia's problem, not the key's.
        if (res.status !== 401 && res.status !== 403) throw new Error(`Clicks search returned ${res.status}`);
      }
      if (round === 1) throw new Error(`Clicks search refused every key (${lastStatus})`);
      this.found = null;
      this.working = null;
    }
    return [];
  }
}
