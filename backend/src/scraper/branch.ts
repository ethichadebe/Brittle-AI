import type { StoreSlug } from "@accucery/types";
import type { Branch } from "./types.js";

// Which stores take part in branch pricing (#66, #131). Kept apart from
// engine.ts so tests that stand the engine in still see the real lists.

// Stores whose lists can be priced at the shopper's own branch. Checkers
// first (#131); Shoprite (#134) and Pick n Pay (#135) follow.
export const LOCATABLE_STORES: readonly StoreSlug[] = ["checkers"];

// Stores whose prices are read for one Price Zone at a time. Once lists can
// have different branches, the latest price of a product in ANY zone could
// be another branch's, so reads for these are scoped to the list's own zone.
// Woolworths is left out on purpose: one search can resolve products to
// different zones (p10, then p30), which a single-zone read would miss.
export const ZONE_SCOPED_STORES: readonly StoreSlug[] = ["checkers", "shoprite"];

/** A list's saved branch, or undefined for the store's default. */
export function branchOf(saved: unknown): Branch | undefined {
  if (saved && typeof saved === "object" && typeof (saved as Branch).name === "string") return saved as Branch;
  return undefined;
}
