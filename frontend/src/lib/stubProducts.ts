import type { Product } from "@accucery/types";

export const STUB_PRODUCTS: Product[] = [
  {
    productId: "stub-1",
    name: "Albany Superior Sliced White Bread 700g",
    imageUrl: "https://placehold.co/64x64/e8f5e9/333?text=Bread",
    regularPrice: 19.99,
    loyaltyPrice: 17.99,
  },
  {
    productId: "stub-2",
    name: "KOO Baked Beans in Tomato Sauce 400g",
    imageUrl: "https://placehold.co/64x64/fff3e0/333?text=Beans",
    regularPrice: 17.99,
    loyaltyPrice: 15.99,
  },
  {
    productId: "stub-3",
    name: "Clover Full Cream Milk 2L",
    imageUrl: "https://placehold.co/64x64/e3f2fd/333?text=Milk",
    regularPrice: 29.99,
    loyaltyPrice: 26.99,
  },
  {
    productId: "stub-4",
    name: "Jungle Oats 1kg",
    imageUrl: "https://placehold.co/64x64/fce4ec/333?text=Oats",
    regularPrice: 49.99,
    loyaltyPrice: 44.99,
  },
  {
    productId: "stub-5",
    name: "Coca-Cola Original 2L",
    imageUrl: "https://placehold.co/64x64/ffebee/333?text=Cola",
    regularPrice: 27.99,
    loyaltyPrice: null,
  },
];

export function searchStub(query: string): Product[] {
  if (!query.trim()) return STUB_PRODUCTS;
  const q = query.toLowerCase();
  return STUB_PRODUCTS.filter((p) => p.name.toLowerCase().includes(q));
}
