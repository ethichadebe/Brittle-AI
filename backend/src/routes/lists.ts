import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import type { GroceryList, StoreSlug } from "@accucery/types";

export async function listsRoutes(app: FastifyInstance) {
  // GET /lists — all lists with item count and total price
  app.get<{ Reply: { lists: GroceryList[] } }>("/lists", async () => {
    const lists = await prisma.list.findMany({
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });

    return {
      lists: lists.map((l) => ({
        id: l.id,
        storeSlug: l.storeSlug as StoreSlug,
        name: l.name,
        createdAt: l.createdAt.toISOString(),
        itemCount: l.items.length,
        totalPrice: l.items.reduce(
          (sum, item) => sum + item.regularPrice.toNumber() * item.quantity,
          0
        ),
      })),
    };
  });

  // POST /lists — create a list
  app.post<{
    Body: { storeSlug: StoreSlug; name: string };
    Reply: GroceryList;
  }>("/lists", async (req, reply) => {
    const { storeSlug, name } = req.body;

    if (!storeSlug || !name?.trim()) {
      return reply.status(400).send({ error: "storeSlug and name are required" } as never);
    }

    const list = await prisma.list.create({
      data: { storeSlug, name: name.trim() },
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

  // DELETE /lists/:id — delete a list
  app.delete<{ Params: { id: string } }>("/lists/:id", async (req, reply) => {
    const { id } = req.params;

    const existing = await prisma.list.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "List not found" } as never);

    await prisma.list.delete({ where: { id } });
    return reply.status(204).send();
  });
}
