import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import type { FastifyInstance, InjectOptions } from "fastify";

// The subject of this file: a list belongs to exactly one Shopper, known only
// by the device that created it (ADR 0003, issue #82). Every test below is a
// two-device scenario, because ownership only means something when there is
// someone else it is being withheld from.
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

function asDevice(deviceId: string) {
  return (opts: InjectOptions) => app.inject({ ...opts, cookies: { [DEVICE_ID_COOKIE]: deviceId } });
}

describe("a list belongs to the device that created it", () => {
  it("is invisible to a different device", async () => {
    const alice = asDevice(randomUUID());
    const bob = asDevice(randomUUID());

    const created = await alice({
      method: "POST",
      url: "/lists",
      payload: { storeSlug: "checkers", name: "Alice's list" },
    });
    const list = created.json();

    const aliceView = await alice({ method: "GET", url: "/lists" });
    expect(aliceView.json().lists.map((l: { id: string }) => l.id)).toContain(list.id);

    const bobView = await bob({ method: "GET", url: "/lists" });
    expect(bobView.json().lists.map((l: { id: string }) => l.id)).not.toContain(list.id);
  });

  // Ownership has to be enforced on every route that touches a list by id,
  // not just the listing — otherwise GET /lists hides another device's list
  // while GET /lists/:id/items happily serves it to anyone who guesses the id.
  it("404s, not 403s, when a different device asks for it by id", async () => {
    const alice = asDevice(randomUUID());
    const bob = asDevice(randomUUID());

    const created = await alice({
      method: "POST",
      url: "/lists",
      payload: { storeSlug: "checkers", name: "Alice's list" },
    });
    const list = created.json();

    const res = await bob({ method: "GET", url: `/lists/${list.id}/items` });
    expect(res.statusCode).toBe(404);
  });

  it("cannot be deleted by a different device", async () => {
    const alice = asDevice(randomUUID());
    const bob = asDevice(randomUUID());

    const created = await alice({
      method: "POST",
      url: "/lists",
      payload: { storeSlug: "checkers", name: "Alice's list" },
    });
    const list = created.json();

    const deleteAttempt = await bob({ method: "DELETE", url: `/lists/${list.id}` });
    expect(deleteAttempt.statusCode).toBe(404);

    // Still there, and still Alice's.
    const aliceView = await alice({ method: "GET", url: "/lists" });
    expect(aliceView.json().lists.map((l: { id: string }) => l.id)).toContain(list.id);
  });

  it("cannot have items added by a different device", async () => {
    const alice = asDevice(randomUUID());
    const bob = asDevice(randomUUID());

    const created = await alice({
      method: "POST",
      url: "/lists",
      payload: { storeSlug: "checkers", name: "Alice's list" },
    });
    const list = created.json();

    const res = await bob({
      method: "POST",
      url: `/lists/${list.id}/items`,
      payload: {
        productId: "prod-1",
        productName: "Milk",
        imageUrl: "https://example.com/milk.jpg",
        regularPrice: 20,
        loyaltyPrice: null,
        quantity: 1,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  // A list created before this feature shipped has userId: null. Per the
  // acceptance criteria, that must become invisible to everyone — not deleted,
  // and not silently claimed by whoever asks first.
  it("a pre-existing list with no owner is visible to nobody", async () => {
    const unowned = await testPrisma.list.create({
      data: { storeSlug: "checkers", name: "Nobody's list" },
    });

    const someone = asDevice(randomUUID());
    const listing = await someone({ method: "GET", url: "/lists" });
    expect(listing.json().lists.map((l: { id: string }) => l.id)).not.toContain(unowned.id);

    const byId = await someone({ method: "GET", url: `/lists/${unowned.id}/items` });
    expect(byId.statusCode).toBe(404);

    // Confirm it still exists in the database — this is invisibility, not deletion.
    const stillThere = await testPrisma.list.findUnique({ where: { id: unowned.id } });
    expect(stillThere).not.toBeNull();
  });
});
