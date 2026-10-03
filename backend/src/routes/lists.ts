import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { findOwnedList, ownerKey } from "../listOwnership.js";
import type { BranchLookup, GroceryList, StoreSlug } from "@accucery/types";
import { latestPrices, readZone } from "../services/basketPrices.js";
import { nearestBranch } from "../scraper/engine.js";
import { branchOf, describeBranch, LOCATABLE_STORES, OUT_OF_DELIVERY } from "../scraper/branch.js";
import { LIMITS, limiter, tooMany } from "../rateLimit.js";

// South Africa's mainland, with a margin. A point outside it is a typo or a
// spoof; no store would serve it, so it's refused before any store is asked.
const SA = { latitude: [-35.5, -21.5], longitude: [15.5, 33.5] } as const;
const within = (n: unknown, [lo, hi]: readonly [number, number]) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;

// Branch lookups running or recently finished, by list id. In memory: a
// restart loses one in flight, and the list simply keeps what it had.
interface Lookup {
  done: boolean;
  failed: boolean;
  settled: Promise<void>;
}
const lookups = new Map<string, Lookup>();
// How long PUT waits before answering "still finding". Tests shorten it.
export const LOCATE_WAIT = { ms: 20_000 };
// A finished lookup's outcome (failed or not) is kept this long for GET.
const FORGET_AFTER_MS = 5 * 60 * 1000;

async function lookupStatus(listId: string): Promise<BranchLookup> {
  const lookup = lookups.get(listId);
  if (lookup && !lookup.done) return { finding: true, branchName: null, outOfDelivery: false, failed: false };
  const list = await prisma.list.findUnique({ where: { id: listId } });
  return { finding: false, ...describeBranch(list?.branch), failed: lookup?.failed ?? false };
}

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
          ...describeBranch(l.branch),
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
      outOfDelivery: false,
    });
  });

  // PUT /lists/:id/location — price this list at the branch nearest a point
  // (#131). The point is used to ask the store which branch serves it and
  // is then discarded: only the branch is saved, never the coordinates
  // (POPIA). They arrive in the body, so they never reach a URL or a log.
  //
  // Finding a Shoprite that delivers can take a minute (#134), longer than
  // a proxy will hold a request open. So the lookup runs on its own: this
  // waits a little for it, then answers "still finding", and the app asks
  // GET /lists/:id/location until it's done.
  app.put<{
    Params: { id: string };
    Body: { latitude?: unknown; longitude?: unknown };
    Reply: BranchLookup;
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

    // A second ask while one is running joins it, rather than starting another.
    let lookup = lookups.get(list.id);
    if (!lookup || lookup.done) {
      // #152: only a new lookup counts; asking again joins the running one.
      const wait = limiter.take(`locate:${req.deviceId}`, LIMITS.locatePerDevice);
      if (wait) return tooMany(reply, wait, "location lookups");
      const started: Lookup = { done: false, failed: false, settled: Promise.resolve() };
      started.settled = nearestBranch(list.storeSlug as StoreSlug, { latitude: latitude as number, longitude: longitude as number })
        // Nothing nearby is a real answer: the list says the store doesn't deliver here.
        .then((branch) => prisma.list.update({ where: { id: list.id }, data: { branch: (branch ?? OUT_OF_DELIVERY) as object } }))
        .then(
          () => undefined,
          (err) => {
            // Logged without the point: the error is the store's, not the shopper's.
            req.log.error({ err: String(err) }, "could not find the nearest branch");
            started.failed = true;
          }
        )
        .finally(() => {
          started.done = true;
          setTimeout(() => lookups.get(list.id) === started && lookups.delete(list.id), FORGET_AFTER_MS).unref();
        });
      lookups.set(list.id, started);
      lookup = started;
    }
    await Promise.race([lookup.settled, new Promise((r) => setTimeout(r, LOCATE_WAIT.ms))]);

    const status = await lookupStatus(list.id);
    if (status.failed) return reply.status(502).send({ error: "Couldn't reach the store to find your branch" } as never);
    return reply.status(status.finding ? 202 : 200).send(status);
  });

  // GET /lists/:id/location — where finding this list's branch has got to.
  app.get<{ Params: { id: string }; Reply: BranchLookup }>("/lists/:id/location", async (req, reply) => {
    const list = await findOwnedList(req.params.id, ownerKey(req));
    if (!list) return reply.status(404).send({ error: "List not found" } as never);
    return lookupStatus(list.id);
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
