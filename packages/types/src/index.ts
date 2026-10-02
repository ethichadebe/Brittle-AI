export type { StoreConfig } from "./stores.js";
export { STORE_CONFIGS } from "./stores.js";

// Store

export type StoreSlug =
  | "checkers"
  | "shoprite"
  | "pick-n-pay"
  | "woolworths"
  | "makro";

export interface Store {
  slug: StoreSlug;
  name: string;
  active: boolean;
  loyaltyProgramme: string | null;
}

// Product (returned by search)

export interface Product {
  productId: string;
  name: string;
  imageUrl: string;
  regularPrice: number;
  loyaltyPrice: number | null;
  // Per ADR 0001: an opaque, store-defined identifier for the Price Zone
  // this price was observed in. "none" for a store with no zone ambiguity
  // (Makro, Pick n Pay); "unconfigured" for a store that has zones but no
  // branch/cookie is set up yet (Checkers, Shoprite).
  zone: string;
}

// List

export interface GroceryList {
  id: string;
  storeSlug: StoreSlug;
  name: string;
  createdAt: string;
  itemCount: number;
  // How many of those items are ticked off — the progress shown on the
  // list's card.
  checkedCount: number;
  // An estimate from the latest prices Accucery has observed, not Basket
  // Prices — only an opened list's total stands on those (#77).
  totalPrice: number;
}

// List item

export interface ListItem {
  id: string;
  listId: string;
  productId: string;
  productName: string;
  imageUrl: string;
  regularPrice: number;
  loyaltyPrice: number | null;
  quantity: number;
  isChecked: boolean;
  createdAt: string;
  // When Accucery last observed this price (#77), or null if it never has
  // beyond what the shopper's phone sent when adding it.
  priceObservedAt: string | null;
  priceStatus: BasketPriceStatus;
}

// Whether a list item's price is a Basket Price yet (#77):
// - "current": observed within the Basket Price window
// - "updating": older, and being refreshed right now
// - "outdated": older, and the last refresh couldn't update it
export type BasketPriceStatus = "current" | "updating" | "outdated";

// API response shapes

export interface HealthResponse {
  status: "ok";
}

export interface SearchResponse {
  products: Product[];
}

export interface ListsResponse {
  lists: GroceryList[];
}

// A product the Shopper has had on a list at a store before (#114), offered
// for quick re-adding. Priced at the latest price Accucery has observed, an
// estimate like a home-screen total, not a Basket Price.
export interface RecentProduct {
  productId: string;
  name: string;
  imageUrl: string;
  regularPrice: number;
  loyaltyPrice: number | null;
  // When it was last put on one of the Shopper's lists.
  lastAddedAt: string;
}

export interface RecentProductsResponse {
  products: RecentProduct[];
}

export interface ListItemsResponse {
  items: ListItem[];
}

// Comparison (see ADR 0002, ADR 0004, and #89/#90)

// A Pack Size's common base unit — grams for mass, millilitres for volume.
// Mass and volume are never comparable to each other; see packSize.ts.
export type PackUnit = "g" | "ml";

export interface ComparisonMatch {
  productId: string;
  name: string;
  // Per unit of Pack Size, so two products can be judged against each
  // other regardless of what one pack costs — see ADR 0002.
  unitPrice: number;
  unit: PackUnit;
  // The store's own product photo, so a shopper can see a stand-in next to
  // what it replaces rather than judging by name alone.
  imageUrl: string;
}

export interface ComparisonMatchedItem {
  listItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  matched: true;
  // The list item itself, judged by Unit Price the same way the substitute
  // is, so the two can be compared on equal footing.
  original: ComparisonMatch;
  // The Substitute found at the target store.
  substitute: ComparisonMatch;
  // What buying the same quantity of the Substitute would cost.
  cost: number;
  // Who put this Substitute in the total:
  // - "accucery": Accucery's own name-based match
  // - "shopper": the Shopper's own earlier pick (#91)
  // - "popular": a Popular Substitute other Shoppers chose (#103)
  source: SubstituteSource;
}

export type SubstituteSource = "accucery" | "shopper" | "popular";

// A product the Shopper removed as a Substitute for this item (#91), and so
// left out of matching — named so the Shopper can see why and undo it.
export interface ComparisonRemoved {
  productId: string;
  name: string;
  imageUrl: string;
}

export interface ComparisonSuggestion {
  // A candidate Substitute found at the target store, not confident
  // enough to auto-apply.
  substitute: ComparisonMatch;
  // What buying the same quantity of this candidate would cost, if picked.
  cost: number;
}

export interface ComparisonUnmatchedItem {
  listItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  matched: false;
  // Why: no candidates at the target store, an unreadable Pack Size on
  // either product, an incompatible dimension, or the closest candidate
  // found was too dissimilar to trust. Never a guess.
  reason: string;
  // Up to 3 ranked candidates that weren't confident enough to auto-apply
  // as the Substitute, offered as a manual pick instead of a verdict.
  // Empty when nothing at the target store even had a comparable, readable
  // pack size to suggest.
  suggestions: ComparisonSuggestion[];
  // Products this search returned that the Shopper had removed as a
  // Substitute for this item, and so were left out. Non-empty means the
  // item may be unmatched because of the Shopper's own removal.
  removed: ComparisonRemoved[];
}

// A Shopper's remembered decision about one Substitute pairing (#91).
export type SubstituteChoice = "chosen" | "removed";

export interface SubstitutePairing {
  fromStore: StoreSlug;
  fromProductId: string;
  toStore: StoreSlug;
  toProductId: string;
}

export interface SubstituteDecisionRequest extends SubstitutePairing {
  toProductName: string;
  choice: SubstituteChoice;
}

export type ComparisonItem = ComparisonMatchedItem | ComparisonUnmatchedItem;

export interface ComparisonResult {
  storeSlug: StoreSlug;
  items: ComparisonItem[];
  // Sum of every matched item's cost. An unmatched item contributes
  // nothing — per ADR 0002, dropping it silently would let a store that
  // stocks less look cheaper by omission, so `complete` says so instead.
  total: number;
  unmatchedCount: number;
  itemCount: number;
  complete: boolean;
}
