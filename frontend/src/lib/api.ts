import type { GroceryList, StoreSlug } from "@accucery/types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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
};
