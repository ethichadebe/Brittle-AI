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
    slug: "spar",
    name: "SPAR",
    color: "#007b40",
    active: false,
    loyaltyProgramme: null,
  },
  {
    slug: "makro",
    name: "Makro",
    color: "#c8102e",
    active: false,
    loyaltyProgramme: null,
  },
  {
    slug: "game",
    name: "Game",
    color: "#e8000d",
    active: false,
    loyaltyProgramme: null,
  },
];
