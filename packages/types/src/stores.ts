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

  // Candidates, none of them probed yet. Every field below is a starting point
  // rather than a fact: whether each one even has an online catalogue is the
  // first question, and SPAR failed exactly that test after looking plausible.
  //
  // The colours are brand-family approximations, NOT verified against the real
  // logos - check them before any of these goes live. Three of the seven below
  // are already a red, so the card's name does more work than its colour.
  //
  // loyaltyProgramme stays null until a probe confirms one, the way Woolworths'
  // WRewards was only filled in once its response showed it.

  // Shoprite Holdings, via the OK Franchise Division. If it runs the same
  // platform as Checkers and Shoprite it is a third ShopriteGroupSite and
  // costs almost nothing - but it is a FRANCHISE model, which is what made
  // SPAR unscrapeable. High ceiling, real chance of zero.
  {
    slug: "ok-foods",
    name: "OK Foods",
    color: "#e4002b",
    active: false,
    loyaltyProgramme: null,
  },
  // Shoprite Holdings' discount format. Same shared-platform theory as OK
  // Foods, same franchise caveat, and a thinner online presence.
  {
    slug: "usave",
    name: "Usave",
    color: "#ffd100",
    active: false,
    loyaltyProgramme: null,
  },
  // Fruit & Veg City. An independent grocer with its own online shopping, so
  // the most likely of these four to be a real catalogue on its own platform.
  {
    slug: "food-lovers",
    name: "Food Lover's Market",
    color: "#7ab800",
    active: false,
    loyaltyProgramme: null,
  },
  // Major discount grocer, listed separately from Pick n Pay. Growing fast;
  // its online presence is the unknown.
  {
    slug: "boxer",
    name: "Boxer",
    color: "#d31145",
    active: false,
    loyaltyProgramme: null,
  },
];
