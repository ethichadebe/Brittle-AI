export type { StoreConfig } from "./stores.js";
export { STORE_CONFIGS } from "./stores.js";

// Store

export type StoreSlug =
  | "checkers"
  | "pick-n-pay"
  | "woolworths"
  | "spar"
  | "makro"
  | "game";

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
