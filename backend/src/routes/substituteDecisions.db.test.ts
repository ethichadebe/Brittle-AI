import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Product } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";

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

// What Shoprite answers, per query. A search for the list item returns two
// milks, both confident; a search for either one's own name finds it again,
// the way a remembered pick is looked up.
const CATALOGUE: Record<string, Product[]> = {
  "Milk 2 L": [product("sr-full", "Full Cream Milk 2 L", 27), product("sr-low", "Low Fat Milk 2 L", 25)],
  "Full Cream Milk 2 L": [product("sr-full", "Full Cream Milk 2 L", 27)],
  "Low Fat Milk 2 L": [product("sr-low", "Low Fat Milk 2 L", 25)],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockZone.mockResolvedValue("none");
  mockSearch.mockImplementation(async (_store, query) => CATALOGUE[query] ?? []);
});

function cookieValue(res: { cookies: { name: string; value: string }[] }, name: string) {
  return res.cookies.find((c) => c.name === name)?.value;
}

async function signedInShopper(email: string) {
  const deviceId = randomUUID();
  const send = (opts: InjectOptions) =>
    app.inject({ ...opts, cookies: { ...(opts.cookies as Record<string, string> | undefined), [DEVICE_ID_COOKIE]: deviceId } });
  const signedUp = await signUp(send, { email, password: "correct horse battery staple" });
  const session = cookieValue(signedUp, "accucery_session")!;
  const as = (opts: InjectOptions) =>
    send({ ...opts, cookies: { ...(opts.cookies as Record<string, string> | undefined), accucery_session: session } });

  async function listWithMilk(name = "Monthly") {
    const list = await as({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name } });
    await as({
      method: "POST",
      url: `/lists/${list.json().id}/items`,
      payload: { productId: "milk-1", productName: "Milk 2 L", imageUrl: "", regularPrice: 30, loyaltyPrice: null, quantity: 1, zone: "none" },
    });
    return list.json().id as string;
  }

  async function compare(listId: string) {
    const res = await as({ method: "POST", url: `/lists/${listId}/compare`, payload: { targetStore: "shoprite" } });
    expect(res.statusCode).toBe(200);
    return res.json().items[0];
  }

  const pairing = (toProductId: string) => ({
    fromStore: "checkers",
    fromProductId: "milk-1",
    toStore: "shoprite",
    toProductId,
  });

  const decide = (toProductId: string, toProductName: string, choice: "chosen" | "removed") =>
    as({ method: "PUT", url: "/substitute-decisions", payload: { ...pairing(toProductId), toProductName, choice } });

  const forget = (toProductId: string) =>
    as({ method: "DELETE", url: "/substitute-decisions", payload: pairing(toProductId) });

  return { as, listWithMilk, compare, decide, forget };
}

describe("Substitute decisions (#91)", () => {
  it("refuses a signed-out Shopper", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/substitute-decisions",
      cookies: { [DEVICE_ID_COOKIE]: randomUUID() },
      payload: { fromStore: "checkers", fromProductId: "a", toStore: "shoprite", toProductId: "b", toProductName: "B", choice: "removed" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a decision that isn't one", async () => {
    const shopper = await signedInShopper("bad-body@example.com");
    const res = await shopper.as({
      method: "PUT",
      url: "/substitute-decisions",
      payload: { fromStore: "checkers", fromProductId: "milk-1", toStore: "shoprite", toProductId: "sr-low", toProductName: "x", choice: "maybe" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("applies a picked Substitute in the next Comparison, marked as the Shopper's own", async () => {
    const shopper = await signedInShopper("pick@example.com");
    const listId = await shopper.listWithMilk();

    // Without a decision, Accucery picks the closer-named full cream milk.
    expect((await shopper.compare(listId)).substitute.productId).toBe("sr-full");

    expect((await shopper.decide("sr-low", "Low Fat Milk 2 L", "chosen")).statusCode).toBe(204);

    const item = await shopper.compare(listId);
    expect(item.matched).toBe(true);
    expect(item.substitute.productId).toBe("sr-low");
    expect(item.source).toBe("shopper");
  });

  it("leaves out a removed Substitute, and brings it back on undo", async () => {
    const shopper = await signedInShopper("remove@example.com");
    const listId = await shopper.listWithMilk();

    await shopper.decide("sr-full", "Full Cream Milk 2 L", "removed");
    const afterRemoval = await shopper.compare(listId);
    expect(afterRemoval.matched).toBe(true);
    expect(afterRemoval.substitute.productId).toBe("sr-low");

    await shopper.decide("sr-low", "Low Fat Milk 2 L", "removed");
    const nothingLeft = await shopper.compare(listId);
    expect(nothingLeft.matched).toBe(false);
    expect(nothingLeft.removed.map((r: { productId: string }) => r.productId).sort()).toEqual(["sr-full", "sr-low"]);

    expect((await shopper.forget("sr-full")).statusCode).toBe(204);
    const undone = await shopper.compare(listId);
    expect(undone.matched).toBe(true);
    expect(undone.substitute.productId).toBe("sr-full");
  });

  it("keeps one decision per pairing, the most recent winning", async () => {
    const shopper = await signedInShopper("latest@example.com");
    const listId = await shopper.listWithMilk();

    await shopper.decide("sr-low", "Low Fat Milk 2 L", "chosen");
    await shopper.decide("sr-low", "Low Fat Milk 2 L", "removed");

    const item = await shopper.compare(listId);
    expect(item.substitute.productId).toBe("sr-full");
    expect(item.source).toBe("accucery");
  });

  it("replaces an older pick for the same item with a newer one", async () => {
    const shopper = await signedInShopper("repick@example.com");
    const listId = await shopper.listWithMilk();

    await shopper.decide("sr-low", "Low Fat Milk 2 L", "chosen");
    await shopper.decide("sr-full", "Full Cream Milk 2 L", "chosen");

    const item = await shopper.compare(listId);
    expect(item.substitute.productId).toBe("sr-full");
    expect(item.source).toBe("shopper");
  });

  it("follows the product onto the Shopper's other lists", async () => {
    const shopper = await signedInShopper("lists@example.com");
    await shopper.listWithMilk("Monthly");
    const braai = await shopper.listWithMilk("Braai");

    await shopper.decide("sr-low", "Low Fat Milk 2 L", "chosen");

    expect((await shopper.compare(braai)).substitute.productId).toBe("sr-low");
  });

  it("lets two Shoppers hold opposite decisions for the same pairing", async () => {
    const picker = await signedInShopper("picker@example.com");
    const remover = await signedInShopper("remover@example.com");
    const pickerList = await picker.listWithMilk();
    const removerList = await remover.listWithMilk();

    await picker.decide("sr-low", "Low Fat Milk 2 L", "chosen");
    await remover.decide("sr-low", "Low Fat Milk 2 L", "removed");

    expect((await picker.compare(pickerList)).substitute.productId).toBe("sr-low");
    const removerItem = await remover.compare(removerList);
    expect(removerItem.substitute.productId).toBe("sr-full");
    expect(removerItem.source).toBe("accucery");
  });

  it("goes with the Account when the Account is deleted", async () => {
    const shopper = await signedInShopper("deleted@example.com");
    await shopper.decide("sr-low", "Low Fat Milk 2 L", "chosen");
    expect(await testPrisma.substituteDecision.count()).toBe(1);

    await testPrisma.account.delete({ where: { email: "deleted@example.com" } });

    expect(await testPrisma.substituteDecision.count()).toBe(0);
  });
});
