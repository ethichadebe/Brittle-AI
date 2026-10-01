import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { findOwnedList, ownerKey } from "../listOwnership.js";
import type { ListItem, StoreSlug } from "@accucery/types";
import { basketPrices } from "../services/basketPrices.js";

type ListItemRow = Parameters<typeof toListItem>[0];

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
}): Omit<ListItem, "priceObservedAt" | "priceStatus"> {
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

// Every list item leaves the server priced at its Basket Price (#77): the
// latest observed price, with how old it is and whether it's being
// refreshed — never the price the shopper's phone sent when adding it.
async function priced(storeSlug: StoreSlug, rows: ListItemRow[]): Promise<ListItem[]> {
  const prices = await basketPrices(
    storeSlug,
    rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      regularPrice: r.regularPrice.toNumber(),
      loyaltyPrice: r.loyaltyPrice?.toNumber() ?? null,
    }))
  );
  return rows.map((row) => {
    const price = prices.get(row.productId)!;
    return {
      ...toListItem(row),
      regularPrice: price.regularPrice,
      loyaltyPrice: price.loyaltyPrice,
      priceObservedAt: price.observedAt?.toISOString() ?? null,
      priceStatus: price.status,
    };
  });
}

export async function listItemsRoutes(app: FastifyInstance) {
  // GET /lists/:id/items
  app.get<{ Params: { id: string }; Reply: { items: ListItem[] } }>(
    "/lists/:id/items",
    async (req, reply) => {
      const list = await prisma.list.findFirst({
        where: { id: req.params.id, userId: ownerKey(req) },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      if (!list) return reply.status(404).send({ error: "List not found" } as never);

      const items = await priced(list.storeSlug as StoreSlug, list.items);

      return { items };
    }
  );

  // POST /lists/:id/items
  app.post<{
    Params: { id: string };
    Body: Pick<ListItem, "productId" | "productName" | "imageUrl" | "regularPrice" | "loyaltyPrice" | "quantity">;
    Reply: ListItem;
  }>("/lists/:id/items", async (req, reply) => {
    const list = await findOwnedList(req.params.id, ownerKey(req));
    if (!list) return reply.status(404).send({ error: "List not found" } as never);

    const { productId, productName, imageUrl, regularPrice, loyaltyPrice, quantity } = req.body;
    const addedQuantity = quantity ?? 1;

    // The same product added twice is the same item, not two rows — see #83.
    // isChecked is deliberately left out of the update: merging must never
    // silently uncheck something the shopper already ticked off.
    const existing = await prisma.listItem.findFirst({
      where: { listId: req.params.id, productId },
    });
    const row = existing
      ? await prisma.listItem.update({
          where: { id: existing.id },
          data: {
            productName,
            imageUrl,
            regularPrice,
            loyaltyPrice,
            quantity: existing.quantity + addedQuantity,
          },
        })
      : await prisma.listItem.create({
          data: {
            listId: req.params.id,
            productId,
            productName,
            imageUrl,
            regularPrice,
            loyaltyPrice,
            quantity: addedQuantity,
          },
        });

    // Deliberately not written to price_cache (#77). The search that showed
    // this product already put its price there, stamped with when it was
    // actually observed — up to a day ago for a cached search. Restamping
    // it here as "just now" would let a day-old price skip the refresh a
    // list total depends on, and would let any client set the shared price
    // every other shopper sees.
    const [item] = await priced(list.storeSlug as StoreSlug, [row]);
    return reply.status(existing ? 200 : 201).send(item);
  });

  // PATCH /lists/:id/items/:itemId
  app.patch<{
    Params: { id: string; itemId: string };
    Body: Partial<Pick<ListItem, "quantity" | "isChecked">>;
    Reply: ListItem;
  }>("/lists/:id/items/:itemId", async (req, reply) => {
    const list = await findOwnedList(req.params.id, ownerKey(req));
    if (!list) return reply.status(404).send({ error: "Item not found" } as never);

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
    const [item] = await priced(list.storeSlug as StoreSlug, [row]);
    return item;
  });

  // DELETE /lists/:id/items/:itemId
  app.delete<{ Params: { id: string; itemId: string } }>(
    "/lists/:id/items/:itemId",
    async (req, reply) => {
      const list = await findOwnedList(req.params.id, ownerKey(req));
      if (!list) return reply.status(404).send({ error: "Item not found" } as never);

      const existing = await prisma.listItem.findUnique({ where: { id: req.params.itemId } });
      if (!existing || existing.listId !== req.params.id)
        return reply.status(404).send({ error: "Item not found" } as never);

      await prisma.listItem.delete({ where: { id: req.params.itemId } });
      return reply.status(204).send();
    }
  );
}
