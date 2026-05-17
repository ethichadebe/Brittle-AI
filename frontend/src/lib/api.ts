import type { GroceryList, ListItem, Product, SearchResponse, StoreSlug } from "@accucery/types";

const BASE = "/api";

export function imgSrc(url: string): string {
  if (!url) return "";
  return `${BASE}/image-proxy?url=${encodeURIComponent(url)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...(init?.body != null ? { headers: { "Content-Type": "application/json" } } : {}),
    ...init,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  lists: {
    list: () =>
      request<{ lists: GroceryList[] }>("/lists").then((r) => r.lists),

    create: (storeSlug: StoreSlug, name: string) =>
      request<GroceryList>("/lists", {
        method: "POST",
        body: JSON.stringify({ storeSlug, name }),
      }),

    delete: (id: string) =>
      request<void>(`/lists/${id}`, { method: "DELETE" }),
  },

  items: {
    list: (listId: string) =>
      request<{ items: ListItem[] }>(`/lists/${listId}/items`).then((r) => r.items),

    add: (listId: string, item: Pick<ListItem, "productId" | "productName" | "imageUrl" | "regularPrice" | "loyaltyPrice">) =>
      request<ListItem>(`/lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify({ ...item, quantity: 1 }),
      }),

    patch: (listId: string, itemId: string, patch: Partial<Pick<ListItem, "quantity" | "isChecked">>) =>
      request<ListItem>(`/lists/${listId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),

    delete: (listId: string, itemId: string) =>
      request<void>(`/lists/${listId}/items/${itemId}`, { method: "DELETE" }),
  },

  search: (store: StoreSlug, q: string): Promise<Product[]> =>
    request<SearchResponse>(`/search?store=${store}&q=${encodeURIComponent(q)}`).then(
      (r) => r.products
    ),
};
