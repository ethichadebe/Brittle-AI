import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { findOwnedList, ownerKey } from "../listOwnership.js";
import type { GroceryList, StoreSlug } from "@accucery/types";
import { latestPrices } from "../services/basketPrices.js";

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
    const latestByStore = new Map<string, Map<string, number>>();
    for (const storeSlug of new Set(lists.map((l) => l.storeSlug))) {
      const productIds = lists.filter((l) => l.storeSlug === storeSlug).flatMap((l) => l.items.map((i) => i.productId));
      latestByStore.set(storeSlug, await latestPrices(storeSlug, productIds));
    }

    return {
      lists: lists.map((l) => {
        const latest = latestByStore.get(l.storeSlug)!;
        return {
          id: l.id,
          storeSlug: l.storeSlug as StoreSlug,
          name: l.name,
          createdAt: l.createdAt.toISOString(),
          itemCount: l.items.length,
          totalPrice: l.items.reduce(
            (sum, item) => sum + (latest.get(item.productId) ?? item.regularPrice.toNumber()) * item.quantity,
            0
          ),
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
      totalPrice: 0,
    });
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
