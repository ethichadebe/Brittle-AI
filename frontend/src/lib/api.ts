import type {
  ComparisonResult,
  GroceryList,
  ListItem,
  Product,
  RecentProductsResponse,
  SearchResponse,
  StoreSlug,
  SubstituteDecisionRequest,
  SubstitutePairing,
} from "@accucery/types";

const BASE = "/api";

export interface AccountPublic {
  id: string;
  email: string;
}

// Named when this device had a list whose name and Store match one already
// on the Account being signed into — see #86.
export interface ListCollision {
  anonymousListId: string;
  name: string;
  storeSlug: string;
}

export interface SignedIn extends AccountPublic {
  collisions: ListCollision[];
}

export type CollisionResolution = "combine" | "keep-both";

export function imgSrc(url: string): string {
  if (!url) return "";
  return `${BASE}/image-proxy?url=${encodeURIComponent(url)}`;
}

// ApiError carries the backend's own message (e.g. "Invalid email or
// password") rather than a bare status code, so a form can show the shopper
// something they can act on instead of "401 Unauthorized".
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const err = (body as { error?: unknown }).error;
  return typeof err === "string" ? err : undefined;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...(init?.body != null ? { headers: { "Content-Type": "application/json" } } : {}),
    ...init,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const message = await res.json().then(errorMessage).catch(() => undefined);
    throw new ApiError(res.status, message ?? `${res.status} ${res.statusText}`);
  }
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

    rename: (id: string, name: string) =>
      request<void>(`/lists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),

    delete: (id: string) =>
      request<void>(`/lists/${id}`, { method: "DELETE" }),

    // #131: price the list at the branch nearest this point. The point goes
    // in the body, never the URL, and the server keeps only the branch.
    locate: (id: string, where: { latitude: number; longitude: number }) =>
      request<{ branchName: string | null }>(`/lists/${id}/location`, {
        method: "PUT",
        body: JSON.stringify(where),
      }),

    compare: (id: string, targetStore: StoreSlug) =>
      request<ComparisonResult>(`/lists/${id}/compare`, {
        method: "POST",
        body: JSON.stringify({ targetStore }),
      }),
  },

  items: {
    list: (listId: string) =>
      request<{ items: ListItem[] }>(`/lists/${listId}/items`).then((r) => r.items),

    add: (
      listId: string,
      item: Pick<ListItem, "productId" | "productName" | "imageUrl" | "regularPrice" | "loyaltyPrice">
    ) =>
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

  // #91: a Shopper's remembered picks and removals of Substitutes.
  substitutes: {
    decide: (decision: SubstituteDecisionRequest) =>
      request<void>("/substitute-decisions", { method: "PUT", body: JSON.stringify(decision) }),

    forget: (pairing: SubstitutePairing) =>
      request<void>("/substitute-decisions", { method: "DELETE", body: JSON.stringify(pairing) }),
  },

  // With a listId, searched as that list's branch (#131).
  search: (store: StoreSlug, q: string, signal?: AbortSignal, listId?: string): Promise<Product[]> =>
    request<SearchResponse>(
      `/search?store=${store}&q=${encodeURIComponent(q)}${listId ? `&listId=${encodeURIComponent(listId)}` : ""}`,
      { signal }
    ).then((r) => r.products),

  // #114: products this Shopper has had on their lists at a store.
  recentProducts: (store: StoreSlug) =>
    request<RecentProductsResponse>(`/recent-products?store=${store}`).then((r) => r.products),

  account: {
    // Who, if anyone, this browser is signed in as. Never throws for
    // "not signed in" — that's `{ account: null }`, not an error.
    session: () => request<{ account: AccountPublic | null }>("/accounts/session"),

    signUp: (email: string, password: string) =>
      request<SignedIn>("/accounts", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    signIn: (email: string, password: string) =>
      request<SignedIn>("/accounts/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    signOut: () => request<void>("/accounts/sign-out", { method: "POST" }),

    resolveCollision: (anonymousListId: string, resolution: CollisionResolution) =>
      request<void>(`/accounts/collisions/${anonymousListId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution }),
      }),
  },
};
