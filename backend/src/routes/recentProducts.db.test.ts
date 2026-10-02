import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RecentProduct } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { RECENT_PRODUCTS_LIMIT } from "./recentProducts.js";

// Recent (#114): what this Shopper has had on their lists at a store, for
// quick re-adding.
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function listAt(owner: string, storeSlug: string, items: { productId: string; name: string; price: number; at: Date }[]) {
  const list = await testPrisma.list.create({ data: { storeSlug, name: "List", userId: owner } });
  for (const i of items) {
    await testPrisma.listItem.create({
      data: {
        listId: list.id, productId: i.productId, productName: i.name, imageUrl: `https://img.test/${i.name}`,
        regularPrice: i.price, loyaltyPrice: null, createdAt: i.at,
      },
    });
  }
  return list.id;
}

async function recent(owner: string, store = "checkers"): Promise<RecentProduct[]> {
  const res = await app.inject({ method: "GET", url: `/recent-products?store=${store}`, cookies: { [DEVICE_ID_COOKIE]: owner } });
  expect(res.statusCode).toBe(200);
  return res.json().products;
}

const id = () => `p-${randomUUID()}`;

describe("recent products (#114)", () => {
  it("lists products from the Shopper's lists at that store, most recently added first, each once", async () => {
    const me = randomUUID();
    const [milk, bread, eggs] = [id(), id(), id()];
    await listAt(me, "checkers", [
      { productId: milk, name: "Milk", price: 30, at: minutesAgo(300) },
      { productId: bread, name: "Bread", price: 20, at: minutesAgo(200) },
    ]);
    await listAt(me, "checkers", [
      { productId: milk, name: "Milk", price: 31, at: minutesAgo(10) },
      { productId: eggs, name: "Eggs", price: 70, at: minutesAgo(100) },
    ]);

    const products = await recent(me);
    expect(products.map((p) => p.name)).toEqual(["Milk", "Eggs", "Bread"]);
    expect(products[0].regularPrice).toBe(31);
    expect(Date.parse(products[0].lastAddedAt)).toBeGreaterThan(Date.parse(products[1].lastAddedAt));
  });

  it("leaves out other stores and other Shoppers", async () => {
    const me = randomUUID();
    const someoneElse = randomUUID();
    await listAt(me, "pick-n-pay", [{ productId: id(), name: "PnP milk", price: 30, at: minutesAgo(5) }]);
    await listAt(someoneElse, "checkers", [{ productId: id(), name: "Their milk", price: 30, at: minutesAgo(5) }]);
    await listAt(me, "checkers", [{ productId: id(), name: "My bread", price: 20, at: minutesAgo(50) }]);

    expect((await recent(me)).map((p) => p.name)).toEqual(["My bread"]);
    expect((await recent(me, "pick-n-pay")).map((p) => p.name)).toEqual(["PnP milk"]);
  });

  it("prices each at the latest price seen, not the one stored when it was added", async () => {
    const me = randomUUID();
    const milk = id();
    await listAt(me, "checkers", [{ productId: milk, name: "Milk", price: 30, at: minutesAgo(60 * 24 * 20) }]);
    await testPrisma.priceCache.create({
      data: { storeSlug: "checkers", productId: milk, productName: "Milk", imageUrl: "", zone: "none", regularPrice: 34.5, loyaltyPrice: 32, scrapedAt: minutesAgo(30) },
    });

    const [product] = await recent(me);
    expect([product.regularPrice, product.loyaltyPrice]).toEqual([34.5, 32]);
  });

  it(`stops at ${RECENT_PRODUCTS_LIMIT}`, async () => {
    const me = randomUUID();
    await listAt(
      me,
      "checkers",
      Array.from({ length: RECENT_PRODUCTS_LIMIT + 5 }, (_, i) => ({ productId: id(), name: `P${i}`, price: 10, at: minutesAgo(i) }))
    );
    const products = await recent(me);
    expect(products).toHaveLength(RECENT_PRODUCTS_LIMIT);
    expect(products[0].name).toBe("P0");
  });

  it("is empty for a new Shopper and refuses an unknown store", async () => {
    expect(await recent(randomUUID())).toEqual([]);
    const res = await app.inject({ method: "GET", url: "/recent-products?store=spar", cookies: { [DEVICE_ID_COOKIE]: randomUUID() } });
    expect(res.statusCode).toBe(400);
  });
});
