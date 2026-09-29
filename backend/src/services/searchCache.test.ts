import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  prisma: {
    searchCache: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { isFresh, TTL_MS, normaliseQuery, getCachedSearch, upsertSearch } from "./searchCache.js";
import { prisma } from "../db.js";

const findUnique = vi.mocked(prisma.searchCache.findUnique);
const upsert = vi.mocked(prisma.searchCache.upsert);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isFresh", () => {
  it("is fresh within the Indicative Price window", () => {
    expect(isFresh(new Date(Date.now() - TTL_MS / 2))).toBe(true);
  });

  // Inverting this comparison is the mutation #76 asks to be provable: it
  // would make a search answered yesterday look fresh forever.
  it("is stale once the window has passed", () => {
    expect(isFresh(new Date(Date.now() - TTL_MS - 1))).toBe(false);
  });
});

describe("normaliseQuery", () => {
  it("treats Milk, milk and milk (trailing space) as one query", () => {
    expect(normaliseQuery("Milk")).toBe(normaliseQuery("milk"));
    expect(normaliseQuery("milk")).toBe(normaliseQuery("milk "));
  });

  it("collapses internal whitespace too", () => {
    expect(normaliseQuery("full   cream  milk")).toBe("full cream milk");
  });
});

describe("getCachedSearch", () => {
  it("is a miss when nothing is cached", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getCachedSearch("checkers", "p10", "milk")).toBeNull();
  });

  it("is a hit for a fresh row", async () => {
    findUnique.mockResolvedValue({
      storeSlug: "checkers",
      zone: "p10",
      query: "milk",
      productIds: ["a", "b"],
      scrapedAt: new Date(),
    });
    const hit = await getCachedSearch("checkers", "p10", "milk");
    expect(hit?.productIds).toEqual(["a", "b"]);
  });

  it("is a miss once the row is older than the Indicative Price window", async () => {
    findUnique.mockResolvedValue({
      storeSlug: "checkers",
      zone: "p10",
      query: "milk",
      productIds: ["a"],
      scrapedAt: new Date(Date.now() - TTL_MS - 1),
    });
    expect(await getCachedSearch("checkers", "p10", "milk")).toBeNull();
  });

  it("normalises the query before looking it up", async () => {
    findUnique.mockResolvedValue(null);
    await getCachedSearch("checkers", "p10", "  Milk  ");
    expect(findUnique).toHaveBeenCalledWith({
      where: { storeSlug_zone_query: { storeSlug: "checkers", zone: "p10", query: "milk" } },
    });
  });
});

describe("upsertSearch", () => {
  it("keys the row by store, zone and normalised query", async () => {
    await upsertSearch({ storeSlug: "checkers", zone: "p10", query: "  Milk  ", productIds: ["a", "b"] });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeSlug_zone_query: { storeSlug: "checkers", zone: "p10", query: "milk" } },
      })
    );
  });

  // The whole point of the zone being in the key: the same query in two
  // zones must be two rows. Dropping zone from the key (the bug this issue
  // exists to prevent) makes this fail by upserting the same row twice.
  it("keys by zone, not just store and query", async () => {
    await upsertSearch({ storeSlug: "checkers", zone: "p10", query: "milk", productIds: ["a"] });
    await upsertSearch({ storeSlug: "checkers", zone: "p30", query: "milk", productIds: ["b"] });

    expect(upsert).toHaveBeenCalledTimes(2);
    const zonesUsed = upsert.mock.calls.map((call) => call[0]!.where.storeSlug_zone_query!.zone);
    expect(zonesUsed).toEqual(["p10", "p30"]);
  });

  it("stores the ordered product ids, not prices", async () => {
    await upsertSearch({ storeSlug: "checkers", zone: "p10", query: "milk", productIds: ["b", "a"] });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ productIds: ["b", "a"] }),
      })
    );
  });
});
