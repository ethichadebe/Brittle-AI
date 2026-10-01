import type { StoreSlug, SubstituteDecisionRequest, SubstitutePairing } from "@accucery/types";
import { prisma } from "../db.js";
import type { ShopperDecisions } from "./matchItem.js";

// #91: one decision per pairing, the most recent winning — an upsert on the
// pairing's key. A new pick also replaces any older pick for the same item
// at the same store: two remembered picks for one item would leave no way
// to say which to apply.
export async function recordDecision(accountId: string, d: SubstituteDecisionRequest): Promise<void> {
  const pairing = {
    accountId,
    fromStore: d.fromStore,
    fromProductId: d.fromProductId,
    toStore: d.toStore,
    toProductId: d.toProductId,
  };

  await prisma.$transaction(async (tx) => {
    if (d.choice === "chosen") {
      await tx.substituteDecision.deleteMany({
        where: {
          accountId,
          fromStore: d.fromStore,
          fromProductId: d.fromProductId,
          toStore: d.toStore,
          choice: "chosen",
          NOT: { toProductId: d.toProductId },
        },
      });
    }
    await tx.substituteDecision.upsert({
      where: { accountId_fromStore_fromProductId_toStore_toProductId: pairing },
      create: { ...pairing, toProductName: d.toProductName, choice: d.choice },
      update: { toProductName: d.toProductName, choice: d.choice, decidedAt: new Date() },
    });
  });
}

export async function forgetDecision(accountId: string, p: SubstitutePairing): Promise<void> {
  await prisma.substituteDecision.deleteMany({ where: { accountId, ...p } });
}

// Everything this Shopper has decided about Substitutes for these products
// at `toStore`, keyed by the list item's productId — the shape compareList
// takes. Not scoped to a list: a decision follows the product.
export async function loadDecisions(
  accountId: string,
  fromStore: StoreSlug,
  toStore: StoreSlug,
  fromProductIds: string[]
): Promise<Map<string, ShopperDecisions>> {
  const rows = await prisma.substituteDecision.findMany({
    where: { accountId, fromStore, toStore, fromProductId: { in: fromProductIds } },
  });

  const decisions = new Map<string, { removed: Set<string>; chosen?: { productId: string; name: string } }>();
  for (const row of rows) {
    const entry = decisions.get(row.fromProductId) ?? { removed: new Set<string>() };
    if (row.choice === "removed") entry.removed.add(row.toProductId);
    else entry.chosen = { productId: row.toProductId, name: row.toProductName };
    decisions.set(row.fromProductId, entry);
  }
  return decisions;
}
