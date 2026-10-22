import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { upsertCache } from "./priceCache.js";
import { recordComparison, recordPrice } from "./collect.js";
import type { Comparison } from "./compare.js";

vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn().mockResolvedValue("p10"),
}));

import { searchProducts } from "../scraper/engine.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

// A browser: keeps whatever cookies the server sets, as a real one would.
function browser(headers: Record<string, string> = {}) {
  const cookies: Record<string, string> = { [DEVICE_ID_COOKIE]: randomUUID() };
  return {
    deviceId: cookies[DEVICE_ID_COOKIE],
    async send(opts: InjectOptions) {
      const res = await app.inject({ ...opts, headers: { ...headers, ...opts.headers }, cookies });
      for (const c of res.cookies) {
        if (c.value === "" || (c.expires && c.expires.getTime() <= Date.now())) delete cookies[c.name];
        else cookies[c.name] = c.value;
      }
      return res;
    },
  };
}

const ANDROID = {
  "sec-ch-ua-model": '"SM-A546E"',
  "sec-ch-ua-platform": '"Android"',
  "user-agent": "Mozilla/5.0 (Linux; Android 10; K) Chrome/141.0 Mobile Safari/537.36",
};

const beans = {
  productId: "beans-1",
  productName: "KOO Baked Beans 400g",
  imageUrl: "https://example.com/beans.jpg",
  regularPrice: 17.99,
  loyaltyPrice: 15.99,
  quantity: 2,
};

async function listFor(b: ReturnType<typeof browser>) {
  const res = await b.send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Week" } });
  return res.json().id as string;
}

describe("price history", () => {
  const price = { storeSlug: "checkers", productId: "milk-1", productName: "Milk 2L", imageUrl: "", zone: "p10" };

  it("keeps a row per day, where the cache keeps only the latest", async () => {
    await recordPrice({ ...price, regularPrice: 29.99, loyaltyPrice: null }, new Date("2026-10-20T10:00:00Z"));
    await recordPrice({ ...price, regularPrice: 27.99, loyaltyPrice: null }, new Date("2026-10-21T10:00:00Z"));
    // The same Joburg day again: the later price wins, no second row.
    await recordPrice({ ...price, regularPrice: 25.99, loyaltyPrice: 24.99 }, new Date("2026-10-21T20:00:00Z"));

    const rows = await testPrisma.priceHistory.findMany({ orderBy: { day: "asc" } });
    expect(rows.map((r) => [r.day, r.regularPrice.toNumber(), r.loyaltyPrice?.toNumber() ?? null])).toEqual([
      ["2026-10-20", 29.99, null],
      ["2026-10-21", 25.99, 24.99],
    ]);
  });

  it("is written by every price the cache is given", async () => {
    await upsertCache({ ...price, regularPrice: 31.5, loyaltyPrice: null });
    const rows = await testPrisma.priceHistory.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].regularPrice.toNumber()).toBe(31.5);
  });
});

describe("search log", () => {
  it("keeps each search, cleaned up, with how many came back and not who asked", async () => {
    vi.mocked(searchProducts).mockResolvedValueOnce([
      { productId: "m1", name: "Milk", imageUrl: "", zone: "p10", regularPrice: 20, loyaltyPrice: null },
    ]);
    const res = await browser().send({ method: "GET", url: "/search?store=checkers&q=%20Full%20Cream%20MILK%20" });
    expect(res.statusCode).toBe(200);

    const rows = await testPrisma.searchLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ storeSlug: "checkers", query: "full cream milk", resultCount: 1, limited: false });
    // Nothing in the row could say who searched.
    expect(Object.keys(rows[0]).sort()).toEqual(["at", "id", "limited", "query", "resultCount", "storeSlug"]);
  });
});

describe("compare log", () => {
  it("keeps both totals and how each item matched", async () => {
    const items = [
      { productId: "a", productName: "Beans", regularPrice: 20, quantity: 2 },
      { productId: "b", productName: "Rusks", regularPrice: 50, quantity: 1 },
    ];
    const match = { productId: "x", name: "Beans too", unitPrice: 0.04, unit: "g" as const, imageUrl: "" };
    const result: Comparison = {
      items: [
        { listItemId: "1", productId: "a", productName: "Beans", quantity: 2, matched: true, original: match, substitute: match, cost: 36, source: "accucery" },
        { listItemId: "2", productId: "b", productName: "Rusks", quantity: 1, matched: false, reason: "none", suggestions: [], removed: [] },
      ],
      total: 36,
      unmatchedCount: 1,
      itemCount: 2,
      complete: false,
    };
    await recordComparison("checkers", "shoprite", items, result);

    const [row] = await testPrisma.compareLog.findMany();
    expect(row).toMatchObject({ fromStore: "checkers", toStore: "shoprite", itemCount: 2, matchedCount: 1 });
    expect(row.fromTotal.toNumber()).toBe(90);
    expect(row.fromMatchedTotal.toNumber()).toBe(40);
    expect(row.toTotal.toNumber()).toBe(36);
    expect(row.items).toEqual([
      { productId: "a", productName: "Beans", quantity: 2, price: 20, matched: true, toProductId: "x", toProductName: "Beans too", cost: 36, source: "accucery" },
      { productId: "b", productName: "Rusks", quantity: 1, price: 50, matched: false, reason: "none" },
    ]);
  });
});

describe("shopping history", () => {
  it("keeps each item added and ticked off, with the phone's model, and outlives the item", async () => {
    const phone = browser(ANDROID);
    const listId = await listFor(phone);
    const added = await phone.send({ method: "POST", url: `/lists/${listId}/items`, payload: beans });
    const itemId = added.json().id;
    await phone.send({ method: "PATCH", url: `/lists/${listId}/items/${itemId}`, payload: { isChecked: true } });
    // Already ticked: not a second purchase.
    await phone.send({ method: "PATCH", url: `/lists/${listId}/items/${itemId}`, payload: { isChecked: true } });
    await phone.send({ method: "DELETE", url: `/lists/${listId}/items/${itemId}` });

    const rows = await testPrisma.shoppingEvent.findMany({ orderBy: { at: "asc" } });
    expect(rows.map((r) => r.kind)).toEqual(["added", "ticked"]);
    expect(rows[0]).toMatchObject({
      ownerId: phone.deviceId,
      listId,
      storeSlug: "checkers",
      productId: "beans-1",
      quantity: 2,
      deviceModel: "SM-A546E",
      platform: "Android",
    });
  });

  it("names the platform from the browser when there are no client hints", async () => {
    const iphone = browser({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1" });
    const listId = await listFor(iphone);
    await iphone.send({ method: "POST", url: `/lists/${listId}/items`, payload: beans });
    const [row] = await testPrisma.shoppingEvent.findMany();
    expect(row).toMatchObject({ deviceModel: null, platform: "iPhone" });
  });

  it("is on until switched off, and switching it off deletes it and stops it", async () => {
    const phone = browser();
    const listId = await listFor(phone);
    expect((await phone.send({ method: "GET", url: "/history" })).json()).toEqual({ on: true });
    await phone.send({ method: "POST", url: `/lists/${listId}/items`, payload: beans });
    expect(await testPrisma.shoppingEvent.count()).toBe(1);

    const off = await phone.send({ method: "PUT", url: "/history", payload: { on: false } });
    expect(off.json()).toEqual({ on: false });
    expect(await testPrisma.shoppingEvent.count()).toBe(0);

    await phone.send({ method: "POST", url: `/lists/${listId}/items`, payload: { ...beans, productId: "other" } });
    expect(await testPrisma.shoppingEvent.count()).toBe(0);
    expect((await phone.send({ method: "GET", url: "/history" })).json()).toEqual({ on: false });

    await phone.send({ method: "PUT", url: "/history", payload: { on: true } });
    await phone.send({ method: "POST", url: `/lists/${listId}/items`, payload: beans });
    expect(await testPrisma.shoppingEvent.count()).toBe(1);
  });

  it("refuses anything but on or off", async () => {
    const res = await browser().send({ method: "PUT", url: "/history", payload: { on: "yes" } });
    expect(res.statusCode).toBe(400);
  });

  it("goes with the device's lists to the Account it signs in to", async () => {
    const phone = browser();
    const listId = await listFor(phone);
    await phone.send({ method: "POST", url: `/lists/${listId}/items`, payload: beans });
    const res = await signUp(phone.send, { email: "habits@example.com", password: "correct horse battery staple" });
    const accountId = res.json().id;

    const [row] = await testPrisma.shoppingEvent.findMany();
    expect(row.ownerId).toBe(accountId);
  });

  it("stays off for the Account when the device had switched it off", async () => {
    const phone = browser();
    await phone.send({ method: "PUT", url: "/history", payload: { on: false } });
    await signUp(phone.send, { email: "private@example.com", password: "correct horse battery staple" });
    expect((await phone.send({ method: "GET", url: "/history" })).json()).toEqual({ on: false });
  });

  it("is deleted with the Account", async () => {
    const phone = browser();
    const password = "correct horse battery staple";
    const res = await signUp(phone.send, { email: "leaving@example.com", password });
    const accountId = res.json().id;
    const listId = await listFor(phone);
    await phone.send({ method: "POST", url: `/lists/${listId}/items`, payload: beans });
    await testPrisma.historyOptOut.create({ data: { ownerId: "unrelated" } });
    await testPrisma.historyOptOut.create({ data: { ownerId: accountId } }).catch(() => {});
    expect(await testPrisma.shoppingEvent.count({ where: { ownerId: accountId } })).toBe(1);

    const gone = await phone.send({ method: "DELETE", url: "/accounts/me", payload: { password } });
    expect(gone.statusCode).toBe(204);
    expect(await testPrisma.shoppingEvent.count({ where: { ownerId: accountId } })).toBe(0);
    expect(await testPrisma.historyOptOut.count({ where: { ownerId: accountId } })).toBe(0);
  });
});
