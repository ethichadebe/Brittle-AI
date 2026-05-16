import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

// Helper: create a real list in the test DB
const createList = () =>
  testPrisma.list.create({
    data: { storeSlug: "checkers", name: "Test list" },
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
    const res = await app.inject({ method: "GET", url: `/lists/${list.id}/items` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });
});

describe("POST /lists/:id/items", () => {
  // B: adds an item and returns it with correct shape
  it("adds an item and returns the correct shape", async () => {
    const list = await createList();
    const res = await app.inject({
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
    const res = await app.inject({
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
    const addRes = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: stubItem,
    });
    const item = addRes.json();

    const res = await app.inject({
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
    const addRes = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: stubItem,
    });
    const item = addRes.json();

    const res = await app.inject({
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
    const addRes = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: stubItem,
    });
    const item = addRes.json();

    const delRes = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/${item.id}`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({ method: "GET", url: `/lists/${list.id}/items` });
    expect(getRes.json().items).toHaveLength(0);
  });
});

describe("GET /lists — item count and total", () => {
  // G: itemCount and totalPrice reflect items in the list
  it("reflects itemCount and totalPrice after items are added", async () => {
    const list = await createList();
    await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: { ...stubItem, regularPrice: 10, quantity: 1 },
    });
    await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: { ...stubItem, productId: "prod-2", regularPrice: 20, quantity: 2 },
    });

    const res = await app.inject({ method: "GET", url: "/lists" });
    const found = res.json().lists.find((l: { id: string }) => l.id === list.id);
    expect(found.itemCount).toBe(2);
    expect(found.totalPrice).toBe(50); // 10×1 + 20×2
  });
});
