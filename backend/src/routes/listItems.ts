import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import type { ListItem, StoreSlug } from "@accucery/types";

function toListItem(row: {
  id: string;
  listId: string;
  productId: string;
  productName: string;
  imageUrl: string;
  regularPrice: { toNumber(): number };
  loyaltyPrice: { toNumber(): number } | null;
  quantity: number;
  isChecked: boolean;
  createdAt: Date;
}): ListItem {
  return {
    id: row.id,
    listId: row.listId,
    productId: row.productId,
    productName: row.productName,
    imageUrl: row.imageUrl,
    regularPrice: row.regularPrice.toNumber(),
    loyaltyPrice: row.loyaltyPrice?.toNumber() ?? null,
    quantity: row.quantity,
    isChecked: row.isChecked,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listItemsRoutes(app: FastifyInstance) {
  // GET /lists/:id/items
  app.get<{ Params: { id: string }; Reply: { items: ListItem[] } }>(
    "/lists/:id/items",
    async (req, reply) => {
      const list = await prisma.list.findUnique({ where: { id: req.params.id } });
      if (!list) return reply.status(404).send({ error: "List not found" } as never);

      const rows = await prisma.listItem.findMany({
        where: { listId: req.params.id },
        orderBy: { createdAt: "asc" },
      });
      return { items: rows.map(toListItem) };
    }
  );

  // POST /lists/:id/items
  app.post<{
    Params: { id: string };
    Body: Pick<ListItem, "productId" | "productName" | "imageUrl" | "regularPrice" | "loyaltyPrice" | "quantity">;
    Reply: ListItem;
  }>("/lists/:id/items", async (req, reply) => {
    const list = await prisma.list.findUnique({ where: { id: req.params.id } });
    if (!list) return reply.status(404).send({ error: "List not found" } as never);

    const { productId, productName, imageUrl, regularPrice, loyaltyPrice, quantity } = req.body;
    const row = await prisma.listItem.create({
      data: { listId: req.params.id, productId, productName, imageUrl, regularPrice, loyaltyPrice, quantity: quantity ?? 1 },
    });
    return reply.status(201).send(toListItem(row));
  });

  // PATCH /lists/:id/items/:itemId
  app.patch<{
    Params: { id: string; itemId: string };
    Body: Partial<Pick<ListItem, "quantity" | "isChecked">>;
    Reply: ListItem;
  }>("/lists/:id/items/:itemId", async (req, reply) => {
    const existing = await prisma.listItem.findUnique({ where: { id: req.params.itemId } });
    if (!existing || existing.listId !== req.params.id)
      return reply.status(404).send({ error: "Item not found" } as never);

    const { quantity, isChecked } = req.body;
    const row = await prisma.listItem.update({
      where: { id: req.params.itemId },
      data: {
        ...(quantity !== undefined && { quantity }),
        ...(isChecked !== undefined && { isChecked }),
      },
    });
    return toListItem(row);
  });

  // DELETE /lists/:id/items/:itemId
  app.delete<{ Params: { id: string; itemId: string } }>(
    "/lists/:id/items/:itemId",
    async (req, reply) => {
      const existing = await prisma.listItem.findUnique({ where: { id: req.params.itemId } });
      if (!existing || existing.listId !== req.params.id)
        return reply.status(404).send({ error: "Item not found" } as never);

      await prisma.listItem.delete({ where: { id: req.params.itemId } });
      return reply.status(204).send();
    }
  );
}
