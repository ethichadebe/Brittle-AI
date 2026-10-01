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

// #110: the home screen renames a list in place and shows how much of it is
// ticked off.
describe("renaming a list and its progress", () => {
  async function aliceWithList() {
    const alice = asDevice(randomUUID());
    const list = (await alice({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Weekly" } })).json();
    return { alice, list };
  }

  it("renames a list for its owner", async () => {
    const { alice, list } = await aliceWithList();

    const res = await alice({ method: "PATCH", url: `/lists/${list.id}`, payload: { name: "  Braai  " } });

    expect(res.statusCode).toBe(204);
    const names = (await alice({ method: "GET", url: "/lists" })).json().lists.map((l: { name: string }) => l.name);
    expect(names).toEqual(["Braai"]);
  });

  it("refuses an empty name", async () => {
    const { alice, list } = await aliceWithList();
    expect((await alice({ method: "PATCH", url: `/lists/${list.id}`, payload: { name: "   " } })).statusCode).toBe(400);
  });

  it("cannot be renamed by a different device", async () => {
    const { list } = await aliceWithList();
    const bob = asDevice(randomUUID());

    expect((await bob({ method: "PATCH", url: `/lists/${list.id}`, payload: { name: "Mine now" } })).statusCode).toBe(404);
    const stored = await testPrisma.list.findUnique({ where: { id: list.id } });
    expect(stored?.name).toBe("Weekly");
  });

  it("reports how many items are ticked off", async () => {
    const { alice, list } = await aliceWithList();
    const item = (n: number) => ({
      productId: `p${n}`, productName: `Product ${n}`, imageUrl: "", regularPrice: 10, loyaltyPrice: null, quantity: 1,
    });
    const added = [];
    for (const n of [1, 2, 3]) added.push((await alice({ method: "POST", url: `/lists/${list.id}/items`, payload: item(n) })).json());
    await alice({ method: "PATCH", url: `/lists/${list.id}/items/${added[0].id}`, payload: { isChecked: true } });

    const [summary] = (await alice({ method: "GET", url: "/lists" })).json().lists;
    expect(summary.itemCount).toBe(3);
    expect(summary.checkedCount).toBe(1);
  });
});
