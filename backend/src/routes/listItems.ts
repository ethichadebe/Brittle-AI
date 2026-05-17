import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import type { ListItem, StoreSlug } from "@accucery/types";
import { getCachedPrices, isFresh, refreshInBackground, upsertCache } from "../services/priceCache.js";

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
      const list = await prisma.list.findUnique({
        where: { id: req.params.id },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      if (!list) return reply.status(404).send({ error: "List not found" } as never);

      const productIds = list.items.map((i) => i.productId);
      const cached = await getCachedPrices(list.storeSlug, productIds);
      const cacheMap = new Map(cached.map((c) => [c.productId, c]));

      // Trigger background refresh for stale or missing cache entries
      const needsRefresh = list.items.filter((item) => {
        const c = cacheMap.get(item.productId);
        return !c || !isFresh(c.scrapedAt);
      });
      if (needsRefresh.length > 0) {
        refreshInBackground(
          list.storeSlug as StoreSlug,
          needsRefresh.map((i) => ({ productId: i.productId, productName: i.productName }))
        );
      }

      // Overlay cached prices onto items
      const items = list.items.map((item) => {
        const c = cacheMap.get(item.productId);
        const base = toListItem(item);
        if (!c) return base;
        return {
          ...base,
          regularPrice: c.regularPrice.toNumber(),
          loyaltyPrice: c.loyaltyPrice?.toNumber() ?? null,
        };
      });

      return { items };
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

    // Populate cache immediately — prices are fresh from the scraper
    await upsertCache({
      storeSlug: list.storeSlug,
      productId,
      productName,
      regularPrice: Number(regularPrice),
      loyaltyPrice: loyaltyPrice != null ? Number(loyaltyPrice) : null,
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
