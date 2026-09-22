import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import type { FastifyInstance, InjectOptions } from "fastify";

vi.mock("../services/priceCache.js", () => ({
  getCachedPrices: vi.fn().mockResolvedValue([]),
  isFresh: vi.fn().mockReturnValue(true),
  refreshInBackground: vi.fn(),
  upsertCache: vi.fn().mockResolvedValue(undefined),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

// Every list is now scoped to a device (see deviceId.ts). These tests are
// about item CRUD, not ownership itself — see lists.db.test.ts for that — so
// every request in this file speaks as the same one device throughout.
const deviceId = randomUUID();
const inject = (opts: InjectOptions) =>
  app.inject({ ...opts, cookies: { [DEVICE_ID_COOKIE]: deviceId } });

// Helper: create a real list in the test DB, owned by this file's device
const createList = () =>
  testPrisma.list.create({
    data: { storeSlug: "checkers", name: "Test list", userId: deviceId },
  });

const stubItem = {
  productId: "prod-1",
  productName: "KOO Baked Beans 400g",
  imageUrl: "https://example.com/beans.jpg",
  regularPrice: 17.99,
  loyaltyPrice: 15.99,
  quantity: 1,
};

describe("GET /lists/:id/items", () => {
  // A
  it("returns empty array for a new list", async () => {
    const list = await createList();
    const res = await inject({ method: "GET", url: `/lists/${list.id}/items` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });

  // A missing list must be distinguishable from an empty one. Without this the
  // route could return 200 with no items for an id that does not exist and the
  // suite stayed green — found by mutation-checking the 404 branch.
  it("returns 404 when list does not exist", async () => {
    const res = await inject({ method: "GET", url: "/lists/non-existent-id/items" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /lists/:id/items", () => {
  // B: adds an item and returns it with correct shape
  it("adds an item and returns the correct shape", async () => {
    const list = await createList();
    const res = await inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: stubItem,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      listId: list.id,
      productId: stubItem.productId,
      productName: stubItem.productName,
      regularPrice: stubItem.regularPrice,
      loyaltyPrice: stubItem.loyaltyPrice,
      quantity: 1,
      isChecked: false,
    });
    expect(body.id).toBeDefined();
  });

  // C: 404 if list doesn't exist
  it("returns 404 when list does not exist", async () => {
    const res = await inject({
      method: "POST",
      url: "/lists/non-existent-id/items",
      payload: stubItem,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /lists/:id/items/:itemId", () => {
  // D: updates quantity
  it("updates the quantity of an item", async () => {
    const list = await createList();
    const addRes = await inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: stubItem,
    });
    const item = addRes.json();

    const res = await inject({
      method: "PATCH",
      url: `/lists/${list.id}/items/${item.id}`,
      payload: { quantity: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().quantity).toBe(3);
  });

  // E: toggles isChecked
  it("toggles isChecked on an item", async () => {
    const list = await createList();
    const addRes = await inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: stubItem,
    });
    const item = addRes.json();

    const res = await inject({
      method: "PATCH",
      url: `/lists/${list.id}/items/${item.id}`,
      payload: { isChecked: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isChecked).toBe(true);
  });
});

describe("DELETE /lists/:id/items/:itemId", () => {
  // F: removes the item
  it("removes an item and returns 204", async () => {
    const list = await createList();
    const addRes = await inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: stubItem,
    });
    const item = addRes.json();

    const delRes = await inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/${item.id}`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await inject({ method: "GET", url: `/lists/${list.id}/items` });
    expect(getRes.json().items).toHaveLength(0);
  });
});

describe("GET /lists — item count and total", () => {
  // G: itemCount and totalPrice reflect items in the list
  it("reflects itemCount and totalPrice after items are added", async () => {
    const list = await createList();
    await inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: { ...stubItem, regularPrice: 10, quantity: 1 },
    });
    await inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: { ...stubItem, productId: "prod-2", regularPrice: 20, quantity: 2 },
    });

    const res = await inject({ method: "GET", url: "/lists" });
    const found = res.json().lists.find((l: { id: string }) => l.id === list.id);
    expect(found.itemCount).toBe(2);
    expect(found.totalPrice).toBe(50); // 10×1 + 20×2
  });
});
