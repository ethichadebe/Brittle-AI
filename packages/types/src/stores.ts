import type { StoreSlug } from "./index.js";

export interface StoreConfig {
  slug: StoreSlug;
  name: string;
  color: string;
  active: boolean;
  loyaltyProgramme: string | null;
}

export const STORE_CONFIGS: StoreConfig[] = [
  {
    slug: "checkers",
    name: "Checkers",
    color: "#00833e",
    active: true,
    loyaltyProgramme: "Xtra Savings",
  },
  {
    slug: "pick-n-pay",
    name: "Pick n Pay",
    color: "#003087",
    active: true,
    loyaltyProgramme: "Smart Shopper",
  },
  {
    slug: "shoprite",
    name: "Shoprite",
    color: "#da291c",
    active: true,
    // Same programme as Checkers: both are Shoprite Holdings brands.
    loyaltyProgramme: "Xtra Savings",
  },
  {
    slug: "woolworths",
    name: "Woolworths",
    color: "#1a1a1a",
    // Switched on before issue #27 is settled: which of Woolworths' price zones
    // a shopper actually pays is still unconfirmed, and the default is p60. If
    // #27 lands on a different zone, every Woolworths price shown until then was
    // wrong by that zone's difference - which is why #27 stays open rather than
    // being quietly closed by this going live.
    active: true,
    loyaltyProgramme: "WRewards",
  },
  {
    slug: "makro",
    name: "Makro",
    color: "#c8102e",
    // Verified live before switching on: 20 products in 2s, correct prices,
    // zero ScraperAPI credits. Unlike Woolworths there is no price-zone
    // ambiguity - prices[] says by priceType what each number is.
    active: true,
    // Deliberately null. Makro's "Special Price" is a public promotion rather
    // than a card-gated one, so makro.ts quotes the effective price as
    // regularPrice and never sets loyaltyPrice. A store listed here appears in
    // Settings as loyalty-capable, which Makro is not.
    loyaltyProgramme: null,
  },
  {
    slug: "game",
    name: "Game",
    color: "#e8000d",
    // The last unprobed candidate, and the one with a real chance: Game is
    // Massmart, the same owner as Makro, so it may run the same Flipkart stack
    // that makro.ts already parses. Nothing here is confirmed - see issue #35.
    // Colour is a brand-family approximation, not checked against the logo.
    active: false,
    loyaltyProgramme: null,
  },
];
