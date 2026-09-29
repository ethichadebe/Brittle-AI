import type { FastifyInstance } from "fastify";
import type { SearchResponse, StoreSlug } from "@accucery/types";
import { search } from "../services/search.js";

export async function searchRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { store: string; q: string };
    Reply: SearchResponse;
  }>("/search", async (req, reply) => {
    const { store, q } = req.query;
    if (!q?.trim()) return reply.send({ products: [] });
    const products = await search(store as StoreSlug, q.trim());
    return reply.send({ products });
  });
}
