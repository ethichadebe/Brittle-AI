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
    slug: "woolworths",
    name: "Woolworths",
    color: "#1a1a1a",
    active: false,
    loyaltyProgramme: null,
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
