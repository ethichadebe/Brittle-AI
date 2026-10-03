import type { FastifyInstance } from "fastify";
import type { SearchResponse, StoreSlug } from "@accucery/types";
import { search } from "../services/search.js";
import { findOwnedList, ownerKey } from "../listOwnership.js";
import { branchOf } from "../scraper/branch.js";

export async function searchRoutes(app: FastifyInstance) {
  // listId (#131): search as that list's branch, when it's the caller's own
  // list at this store. Anything else searches the store's default.
  app.get<{
    Querystring: { store: string; q: string; listId?: string };
    Reply: SearchResponse;
  }>("/search", async (req, reply) => {
    const { store, q, listId } = req.query;
    if (!q?.trim()) return reply.send({ products: [] });
    const list = listId ? await findOwnedList(listId, ownerKey(req)) : null;
    const branch = list?.storeSlug === store ? branchOf(list.branch) : undefined;
    const products = await search(store as StoreSlug, q.trim(), branch);
    return reply.send({ products });
  });
}
