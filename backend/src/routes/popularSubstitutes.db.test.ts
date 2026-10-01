import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Product } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { ESTABLISHED_ACCOUNT_AGE_MS } from "../services/substituteDecisions.js";

vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn(),
}));

import { searchProducts, currentZone } from "../scraper/engine.js";

const mockSearch = vi.mocked(searchProducts);
const mockZone = vi.mocked(currentZone);

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

function product(productId: string, name: string, regularPrice: number): Product {
  return { productId, name, imageUrl: "", zone: "none", regularPrice, loyaltyPrice: null };
}

// Shoprite, per query. Searching for the list item finds full cream milk,
// which Accucery picks on its own; every milk can also be found again by
// its own name, the way a remembered or popular pick is looked up.
const CATALOGUE: Record<string, Product[]> = {
  "Milk 2 L": [product("sr-full", "Full Cream Milk 2 L", 27), product("sr-low", "Low Fat Milk 2 L", 25)],
  "Full Cream Milk 2 L": [product("sr-full", "Full Cream Milk 2 L", 27)],
  "Low Fat Milk 2 L": [product("sr-low", "Low Fat Milk 2 L", 25)],
  "Oat Milk 2 L": [product("sr-oat", "Oat Milk 2 L", 40)],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockZone.mockReturnValue("none");
  mockSearch.mockImplementation(async (_store, query) => CATALOGUE[query] ?? []);
});

function cookieValue(res: { cookies: { name: string; value: string }[] }, name: string) {
  return res.cookies.find((c) => c.name === name)?.value;
}

const NAMES: Record<string, string> = { "sr-full": "Full Cream Milk 2 L", "sr-low": "Low Fat Milk 2 L", "sr-oat": "Oat Milk 2 L" };

// A signed-in Shopper. "Established" means older than the age at which an
// Account starts counting towards popularity.
async function shopper({ established = true } = {}) {
  const email = `${randomUUID()}@example.com`;
  const deviceId = randomUUID();
  const send = (opts: InjectOptions) =>
    app.inject({ ...opts, cookies: { ...(opts.cookies as Record<string, string> | undefined), [DEVICE_ID_COOKIE]: deviceId } });
  const signUp = await send({ method: "POST", url: "/accounts", payload: { email, password: "correct horse battery staple" } });
  const session = cookieValue(signUp, "accucery_session")!;
  if (established) {
    await testPrisma.account.update({
      where: { email },
      data: { createdAt: new Date(Date.now() - ESTABLISHED_ACCOUNT_AGE_MS - 60_000) },
    });
  }
  const as = (opts: InjectOptions) =>
    send({ ...opts, cookies: { ...(opts.cookies as Record<string, string> | undefined), accucery_session: session } });

  const decide = async (toProductId: string, choice: "chosen" | "removed") => {
    const res = await as({
      method: "PUT",
      url: "/substitute-decisions",
      payload: { fromStore: "checkers", fromProductId: "milk-1", toStore: "shoprite", toProductId, toProductName: NAMES[toProductId], choice },
    });
    expect(res.statusCode).toBe(204);
  };

  const compare = async () => {
    const list = await as({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } });
    await as({
      method: "POST",
      url: `/lists/${list.json().id}/items`,
      payload: { productId: "milk-1", productName: "Milk 2 L", imageUrl: "", regularPrice: 30, loyaltyPrice: null, quantity: 1 },
    });
    const res = await as({ method: "POST", url: `/lists/${list.json().id}/compare`, payload: { targetStore: "shoprite" } });
    expect(res.statusCode).toBe(200);
    return res.json().items[0];
  };

  return { decide, compare };
}

async function shoppersWho(count: number, toProductId: string, choice: "chosen" | "removed", established = true) {
  for (let i = 0; i < count; i++) await (await shopper({ established })).decide(toProductId, choice);
}

describe("Popular Substitutes (#103)", () => {
  it("applies a pairing 3 established Shoppers chose for a 4th, marked popular", async () => {
    await shoppersWho(3, "sr-low", "chosen");

    const item = await (await shopper()).compare();

    expect(item.matched).toBe(true);
    expect(item.substitute.productId).toBe("sr-low");
    expect(item.source).toBe("popular");
  });

  it("needs at least 3 choices", async () => {
    await shoppersWho(2, "sr-low", "chosen");

    const item = await (await shopper()).compare();

    expect(item.substitute.productId).toBe("sr-full");
    expect(item.source).toBe("accucery");
  });

  it("counts removals against a pairing: 3 choices and 2 removals is not popular", async () => {
    await shoppersWho(3, "sr-low", "chosen");
    await shoppersWho(2, "sr-low", "removed");

    const item = await (await shopper()).compare();

    expect(item.source).toBe("accucery");
  });

  it("ignores choices from Accounts younger than the established age", async () => {
    await shoppersWho(2, "sr-low", "chosen");
    await shoppersWho(1, "sr-low", "chosen", false);

    const item = await (await shopper()).compare();

    expect(item.source).toBe("accucery");
  });

  it("is never applied for a Shopper who removed it themselves", async () => {
    await shoppersWho(3, "sr-low", "chosen");
    const me = await shopper();
    await me.decide("sr-low", "removed");

    const item = await me.compare();

    expect(item.substitute.productId).toBe("sr-full");
    expect(item.source).toBe("accucery");
  });

  it("is outranked by the Shopper's own pick", async () => {
    await shoppersWho(3, "sr-low", "chosen");
    const me = await shopper();
    await me.decide("sr-oat", "chosen");

    const item = await me.compare();

    expect(item.substitute.productId).toBe("sr-oat");
    expect(item.source).toBe("shopper");
  });

  it("picks the more chosen pairing when two are popular for one item", async () => {
    await shoppersWho(3, "sr-oat", "chosen");
    await shoppersWho(4, "sr-low", "chosen");

    const item = await (await shopper()).compare();

    expect(item.substitute.productId).toBe("sr-low");
    expect(item.source).toBe("popular");
  });
});
