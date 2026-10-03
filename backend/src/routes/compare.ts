import type { FastifyInstance } from "fastify";
import type { ComparisonResult, StoreSlug } from "@accucery/types";
import { STORE_CONFIGS } from "@accucery/types";
import { prisma } from "../db.js";
import { findOwnedList, ownerKey } from "../listOwnership.js";
import { compareList } from "../services/compare.js";
import { loadDecisions, loadPopular } from "../services/substituteDecisions.js";
import { LIMITS, limiter, tooMany } from "../rateLimit.js";

export async function compareRoutes(app: FastifyInstance) {
  // POST /lists/:id/compare
  app.post<{
    Params: { id: string };
    Body: { targetStore?: string };
    Reply: ComparisonResult;
  }>("/lists/:id/compare", async (req, reply) => {
    // Per ADR 0004: a Comparison spends money on every press, so it is the
    // one thing an anonymous Shopper cannot do — only a real Account can be
    // rate-limited or billed. A prompt, not a silent block or a silent
    // allow, is #90's own acceptance criterion; that prompt is the
    // frontend's job, this 401 is what it prompts on.
    if (!req.accountId) {
      return reply.status(401).send({ error: "Sign in to compare a list against another store" } as never);
    }

    // #152: per Account, which ADR 0004 made the thing that can be limited.
    const wait = limiter.take(`compare:${req.accountId}`, LIMITS.comparePerAccount);
    if (wait) return tooMany(reply, wait, "comparisons");

    const list = await findOwnedList(req.params.id, ownerKey(req));
    if (!list) return reply.status(404).send({ error: "List not found" } as never);

    const targetConfig = STORE_CONFIGS.find((s) => s.slug === req.body.targetStore && s.active);
    if (!targetConfig) {
      return reply.status(400).send({ error: "Not a store Accucery can compare against" } as never);
    }
    // Per ADR 0002, a Comparison prices a list against one OTHER store —
    // against its own store every item would trivially "match" itself,
    // which is not a comparison at all.
    if (targetConfig.slug === list.storeSlug) {
      return reply.status(400).send({ error: "This list is already priced at that store" } as never);
    }

    const items = await prisma.listItem.findMany({
      where: { listId: list.id },
      orderBy: { createdAt: "asc" },
    });

    const targetStore = targetConfig.slug as StoreSlug;
    const fromStore = list.storeSlug as StoreSlug;
    const productIds = items.map((i) => i.productId);
    const [decisions, popular] = await Promise.all([
      loadDecisions(req.accountId, fromStore, targetStore, productIds),
      loadPopular(fromStore, targetStore, productIds),
    ]);
    // A Popular Substitute rides alongside the Shopper's own decisions;
    // matchItem is what makes their own outrank it (#103).
    for (const [productId, pick] of popular) {
      decisions.set(productId, { ...decisions.get(productId), popular: pick });
    }

    const comparison = await compareList(
      items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        regularPrice: i.regularPrice.toNumber(),
        quantity: i.quantity,
        imageUrl: i.imageUrl,
      })),
      targetStore,
      decisions
    );

    return reply.send({ storeSlug: targetConfig.slug, ...comparison });
  });
}
