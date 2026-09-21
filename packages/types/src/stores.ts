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
    // Switched on before issue #27 was settled, with a note that if #27 landed
    // on a zone other than the p60 default then every price shown until then
    // was wrong by that zone's difference. It did: #27 closed on 2026-09-21
    // with p10 measured against the signed-out site, so prices between going
    // live and that fix were under-reported on every zone-varying product.
    //
    // Recorded rather than quietly corrected, because the note was right and
    // the cost was real - roughly a third of a milk search differs by zone.
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
];
