import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { GroceryList, ListItem } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import type { Branch } from "../scraper/types.js";
import { LOCATE_WAIT } from "./lists.js";

// #131: a list priced at the shopper's own branch. Only the store is faked:
// the branch it answers with, and the zone each branch prices in. Saving,
// reading and pricing all run for real against the test database.
vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn(),
  nearestBranch: vi.fn(),
}));

import { searchProducts, currentZone, nearestBranch } from "../scraper/engine.js";

const mockSearch = vi.mocked(searchProducts);
const mockZone = vi.mocked(currentZone);
const mockNearest = vi.mocked(nearestBranch);

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

// Each branch prices in its own zone; no branch is the default's.
const zoneOf = (branch?: Branch) => (branch ? `zone-${branch.name}` : "zone-default");

beforeEach(() => {
  vi.clearAllMocks();
  mockZone.mockImplementation(async (_store, branch) => zoneOf(branch));
  mockSearch.mockResolvedValue([]);
});

// Sandton. Never expected anywhere in the database, a response or a URL.
const HERE = { latitude: -26.1076, longitude: 28.0567 };
const SANDHURST: Branch = { name: "Checkers FX Sandhurst", contexts: [{ storeId: "store-sandhurst" }] };

function asDevice(deviceId = randomUUID()) {
  return (opts: InjectOptions) => app.inject({ ...opts, cookies: { [DEVICE_ID_COOKIE]: deviceId } });
}

async function newList(as: ReturnType<typeof asDevice>, storeSlug = "checkers"): Promise<GroceryList> {
  const res = await as({ method: "POST", url: "/lists", payload: { storeSlug, name: "Monthly" } });
  expect(res.statusCode).toBe(201);
  return res.json();
}

const locate = (as: ReturnType<typeof asDevice>, listId: string, payload: unknown = HERE) =>
  as({ method: "PUT", url: `/lists/${listId}/location`, payload: payload as object });

describe("finding a list's branch from the shopper's location", () => {
  it("a new list has no branch: it uses the default (Joburg) prices", async () => {
    const list = await newList(asDevice());
    expect(list.branchName).toBeNull();
  });

  it("saves the nearest branch on the list and shows its name", async () => {
    const as = asDevice();
    const list = await newList(as);
    mockNearest.mockResolvedValue(SANDHURST);

    const res = await locate(as, list.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ finding: false, branchName: "Checkers FX Sandhurst", outOfDelivery: false, failed: false });
    expect(mockNearest).toHaveBeenCalledWith("checkers", HERE);
    const lists = (await as({ method: "GET", url: "/lists" })).json().lists as GroceryList[];
    expect(lists.find((l) => l.id === list.id)?.branchName).toBe("Checkers FX Sandhurst");
  });

  // POPIA: the point is used once and discarded.
  it("never stores the coordinates, only the branch", async () => {
    const as = asDevice();
    const list = await newList(as);
    mockNearest.mockResolvedValue(SANDHURST);
    await locate(as, list.id);

    const row = await testPrisma.list.findUniqueOrThrow({ where: { id: list.id } });
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(String(HERE.latitude));
    expect(stored).not.toContain(String(HERE.longitude));
    expect(row.branch).toEqual(SANDHURST);
  });

  // #134: Shoprite only prices by branch where it delivers.
  it("says the store doesn't deliver near the shopper, and keeps the default prices", async () => {
    const as = asDevice();
    const list = await newList(as, "shoprite");
    mockNearest.mockResolvedValue(null);

    const res = await locate(as, list.id);

    expect(mockNearest).toHaveBeenCalledWith("shoprite", HERE);
    expect(res.json()).toEqual({ finding: false, branchName: null, outOfDelivery: true, failed: false });
    const lists = (await as({ method: "GET", url: "/lists" })).json().lists as GroceryList[];
    expect(lists.find((l) => l.id === list.id)).toMatchObject({ branchName: null, outOfDelivery: true });
  });

  it("says the store couldn't be reached, and leaves the list as it was", async () => {
    const as = asDevice();
    const list = await newList(as);
    mockNearest.mockRejectedValue(new Error("Checkers API returned 502"));

    const res = await locate(as, list.id);

    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(String(HERE.latitude));
    expect((await testPrisma.list.findUniqueOrThrow({ where: { id: list.id } })).branch).toBeNull();
  });

  it("refuses a point that isn't a South African coordinate", async () => {
    const as = asDevice();
    const list = await newList(as);
    for (const bad of [{}, { latitude: "-26", longitude: 28 }, { latitude: 51.5, longitude: -0.12 }, { latitude: -26.1, longitude: null }]) {
      expect((await locate(as, list.id, bad)).statusCode).toBe(400);
    }
    expect(mockNearest).not.toHaveBeenCalled();
  });

  it("is someone else's list: 404, and their store is never asked", async () => {
    const list = await newList(asDevice());
    expect((await locate(asDevice(), list.id)).statusCode).toBe(404);
    expect(mockNearest).not.toHaveBeenCalled();
  });

  it("a store that doesn't price by branch yet is told so", async () => {
    const as = asDevice();
    const list = await newList(as, "pick-n-pay");
    expect((await locate(as, list.id)).statusCode).toBe(422);
    expect(mockNearest).not.toHaveBeenCalled();
  });
});

// #134: a Shoprite lookup can take a minute, longer than a proxy holds a request.
describe("a slow lookup", () => {
  it("answers 'still finding', then the branch once it's found", async () => {
    const before = LOCATE_WAIT.ms;
    LOCATE_WAIT.ms = 20;
    try {
      const as = asDevice();
      const list = await newList(as, "shoprite");
      let answer!: (b: Branch) => void;
      mockNearest.mockReturnValue(new Promise<Branch>((r) => (answer = r)));

      const first = await locate(as, list.id);
      expect(first.statusCode).toBe(202);
      expect(first.json()).toMatchObject({ finding: true });
      // Asking again joins the lookup running, rather than starting another.
      expect((await locate(as, list.id)).statusCode).toBe(202);
      expect(mockNearest).toHaveBeenCalledTimes(1);
      expect((await as({ method: "GET", url: `/lists/${list.id}/location` })).json()).toMatchObject({ finding: true });

      answer({ name: "Shoprite Sophiatown", contexts: [{ storeId: "store-sophiatown" }] });
      await new Promise((r) => setTimeout(r, 50));

      expect((await as({ method: "GET", url: `/lists/${list.id}/location` })).json()).toEqual({
        finding: false,
        branchName: "Shoprite Sophiatown",
        outOfDelivery: false,
        failed: false,
      });
    } finally {
      LOCATE_WAIT.ms = before;
    }
  });

  it("reports a lookup that failed after the answer went back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = LOCATE_WAIT.ms;
    LOCATE_WAIT.ms = 20;
    try {
      const as = asDevice();
      const list = await newList(as, "shoprite");
      let fail!: (e: Error) => void;
      mockNearest.mockReturnValue(new Promise<Branch>((_, r) => (fail = r)));

      expect((await locate(as, list.id)).statusCode).toBe(202);
      fail(new Error("Shoprite API returned 502"));
      await new Promise((r) => setTimeout(r, 50));

      expect((await as({ method: "GET", url: `/lists/${list.id}/location` })).json()).toMatchObject({ finding: false, failed: true });
      expect((await testPrisma.list.findUniqueOrThrow({ where: { id: list.id } })).branch).toBeNull();
    } finally {
      LOCATE_WAIT.ms = before;
    }
  });

  it("is someone else's list: 404", async () => {
    const list = await newList(asDevice());
    expect((await asDevice()({ method: "GET", url: `/lists/${list.id}/location` })).statusCode).toBe(404);
  });
});

describe("a located list is priced at its own branch", () => {
  it("searches for items as that branch", async () => {
    const as = asDevice();
    const list = await newList(as);
    mockNearest.mockResolvedValue(SANDHURST);
    await locate(as, list.id);

    await as({ method: "GET", url: `/search?store=checkers&q=bread-${randomUUID()}&listId=${list.id}` });

    expect(mockSearch).toHaveBeenCalledWith("checkers", expect.any(String), SANDHURST);
  });

  it("someone else's list id searches the default, not their branch", async () => {
    const owner = asDevice();
    const list = await newList(owner);
    mockNearest.mockResolvedValue(SANDHURST);
    await locate(owner, list.id);

    await asDevice()({ method: "GET", url: `/search?store=checkers&q=bread-${randomUUID()}&listId=${list.id}` });

    expect(mockSearch).toHaveBeenCalledWith("checkers", expect.any(String), undefined);
  });

  // The bug branch pricing could introduce: the newest price of a product in
  // ANY zone used to win, so one list would show another branch's price.
  it("two lists with the same product each show their own branch's price", async () => {
    const as = asDevice();
    const located = await newList(as);
    const plain = await newList(as);
    mockNearest.mockResolvedValue(SANDHURST);
    await locate(as, located.id);

    const productId = `bread-${randomUUID()}`;
    for (const list of [located, plain]) {
      await testPrisma.listItem.create({
        data: { listId: list.id, productId, productName: "White Bread 700g", imageUrl: "", regularPrice: 1, loyaltyPrice: null },
      });
    }
    const observe = (zone: string, regularPrice: number, scrapedAt: Date) =>
      testPrisma.priceCache.create({
        data: { storeSlug: "checkers", productId, productName: "White Bread 700g", imageUrl: "", zone, regularPrice, loyaltyPrice: null, scrapedAt },
      });
    await observe(zoneOf(SANDHURST), 16.99, new Date());
    // Newer, in the default zone: it must not leak onto the Sandhurst list.
    await observe(zoneOf(), 17.99, new Date(Date.now() + 1000));

    const priceOn = async (listId: string) =>
      ((await as({ method: "GET", url: `/lists/${listId}/items` })).json().items as ListItem[])[0].regularPrice;
    expect(await priceOn(located.id)).toBe(16.99);
    expect(await priceOn(plain.id)).toBe(17.99);

    const totals = (await as({ method: "GET", url: "/lists" })).json().lists as GroceryList[];
    expect(totals.find((l) => l.id === located.id)?.totalPrice).toBe(16.99);
    expect(totals.find((l) => l.id === plain.id)?.totalPrice).toBe(17.99);
  });
});
