import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { findOwnedList, ownerKey } from "../listOwnership.js";
import type { GroceryList, StoreSlug } from "@accucery/types";
import { latestPrices, readZone } from "../services/basketPrices.js";
import { nearestBranch } from "../scraper/engine.js";
import { branchOf, LOCATABLE_STORES } from "../scraper/branch.js";

// South Africa's mainland, with a margin. A point outside it is a typo or a
// spoof; no store would serve it, so it's refused before any store is asked.
const SA = { latitude: [-35.5, -21.5], longitude: [15.5, 33.5] } as const;
const within = (n: unknown, [lo, hi]: readonly [number, number]) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;

export async function listsRoutes(app: FastifyInstance) {
  // GET /lists — all lists owned by this Shopper, with item count and total price
  app.get<{ Reply: { lists: GroceryList[] } }>("/lists", async (req) => {
    const lists = await prisma.list.findMany({
      where: { userId: ownerKey(req) },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });

    // Per #77, a total for a list that isn't open is an estimate: each item
    // at the latest price Accucery has observed, of any age, and nothing is
    // scraped to get it. The price stored when the item was added is only a
    // fallback — it never moves, so on its own it would drift for weeks.
    // Each list's estimate comes from its own branch's prices (#131), so
    // lists are grouped by store and zone, not store alone.
    const zones = await Promise.all(lists.map((l) => readZone(l.storeSlug as StoreSlug, branchOf(l.branch))));
    const groupOf = (i: number) => `${lists[i].storeSlug}\u0000${zones[i] ?? ""}`;
    const latestByGroup = new Map<string, Map<string, number>>();
    for (const group of new Set(lists.map((_, i) => groupOf(i)))) {
      const members = lists.map((l, i) => ({ l, i })).filter(({ i }) => groupOf(i) === group);
      const productIds = members.flatMap(({ l }) => l.items.map((item) => item.productId));
      latestByGroup.set(group, await latestPrices(members[0].l.storeSlug, productIds, zones[members[0].i]));
    }

    return {
      lists: lists.map((l, i) => {
        const latest = latestByGroup.get(groupOf(i))!;
        return {
          id: l.id,
          storeSlug: l.storeSlug as StoreSlug,
          name: l.name,
          createdAt: l.createdAt.toISOString(),
          itemCount: l.items.length,
          checkedCount: l.items.filter((i) => i.isChecked).length,
          totalPrice: l.items.reduce(
            (sum, item) => sum + (latest.get(item.productId) ?? item.regularPrice.toNumber()) * item.quantity,
            0
          ),
          branchName: branchOf(l.branch)?.name ?? null,
        };
      }),
    };
  });

  // POST /lists — create a list, owned by this Shopper
  app.post<{
    Body: { storeSlug: StoreSlug; name: string };
    Reply: GroceryList;
  }>("/lists", async (req, reply) => {
    const { storeSlug, name } = req.body;

    if (!storeSlug || !name?.trim()) {
      return reply.status(400).send({ error: "storeSlug and name are required" } as never);
    }

    const list = await prisma.list.create({
      data: { storeSlug, name: name.trim(), userId: ownerKey(req) },
    });

    return reply.status(201).send({
      id: list.id,
      storeSlug: list.storeSlug as StoreSlug,
      name: list.name,
      createdAt: list.createdAt.toISOString(),
      itemCount: 0,
      checkedCount: 0,
      totalPrice: 0,
      branchName: null,
    });
  });

  // PUT /lists/:id/location — price this list at the branch nearest a point
  // (#131). The point is used to ask the store which branch serves it and
  // is then discarded: only the branch is saved, never the coordinates
  // (POPIA). They arrive in the body, so they never reach a URL or a log.
  // Answers with the branch's name, or null when the store has none there
  // and the list keeps the default (Joburg) prices.
  app.put<{
    Params: { id: string };
    Body: { latitude?: unknown; longitude?: unknown };
    Reply: { branchName: string | null };
  }>("/lists/:id/location", async (req, reply) => {
    const { latitude, longitude } = req.body ?? {};
    if (!within(latitude, SA.latitude) || !within(longitude, SA.longitude)) {
      return reply.status(400).send({ error: "latitude and longitude in South Africa are required" } as never);
    }

    const list = await findOwnedList(req.params.id, ownerKey(req));
    if (!list) return reply.status(404).send({ error: "List not found" } as never);
    if (!LOCATABLE_STORES.includes(list.storeSlug as StoreSlug)) {
      return reply.status(422).send({ error: "This store's prices don't vary by branch yet" } as never);
    }

    let branch;
    try {
      branch = await nearestBranch(list.storeSlug as StoreSlug, { latitude: latitude as number, longitude: longitude as number });
    } catch (err) {
      // Logged without the point: the error is the store's, not the shopper's.
      req.log.error({ err: String(err) }, "could not find the nearest branch");
      return reply.status(502).send({ error: "Couldn't reach the store to find your branch" } as never);
    }
    // Nothing nearby is a real answer: the list stays on the default.
    if (!branch) return reply.send({ branchName: null });

    await prisma.list.update({ where: { id: list.id }, data: { branch: branch as object } });
    return reply.send({ branchName: branch.name });
  });

  // PATCH /lists/:id — rename a list owned by this Shopper. Two lists may
  // share a name and a Store (CONTEXT.md), so a rename never collides.
  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/lists/:id", async (req, reply) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return reply.status(400).send({ error: "name is required" } as never);

    const existing = await findOwnedList(req.params.id, ownerKey(req));
    if (!existing) return reply.status(404).send({ error: "List not found" } as never);

    await prisma.list.update({ where: { id: existing.id }, data: { name } });
    return reply.status(204).send();
  });

  // DELETE /lists/:id — delete a list owned by this Shopper
  app.delete<{ Params: { id: string } }>("/lists/:id", async (req, reply) => {
    const { id } = req.params;

    const existing = await findOwnedList(id, ownerKey(req));
    if (!existing) return reply.status(404).send({ error: "List not found" } as never);

    await prisma.list.delete({ where: { id } });
    return reply.status(204).send();
  });
}
