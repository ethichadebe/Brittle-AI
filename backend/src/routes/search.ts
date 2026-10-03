import type { FastifyInstance } from "fastify";
import type { SearchResponse, StoreSlug } from "@accucery/types";
import { search } from "../services/search.js";
import { findOwnedList, ownerKey } from "../listOwnership.js";
import { branchOf } from "../scraper/branch.js";
import { LIMITS, limiter, tooMany } from "../rateLimit.js";

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
    // #152: past the limit, only answers already known are given.
    const wait = limiter.take(`search:${req.deviceId}`, LIMITS.searchPerDevice);
    if (wait) {
      const cached = await search(store as StoreSlug, q.trim(), branch, { cacheOnly: true });
      if (cached === null) return tooMany(reply, wait, "searches");
      return reply.send({ products: cached });
    }
    const products = await search(store as StoreSlug, q.trim(), branch);
    return reply.send({ products });
  });
}
