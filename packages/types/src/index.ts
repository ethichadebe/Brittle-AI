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
}

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
}

export interface ComparisonUnmatchedItem {
  listItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  matched: false;
  // Why: no candidates at the target store, an unreadable Pack Size on
  // either product, or an incompatible dimension. Never a guess.
  reason: string;
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
