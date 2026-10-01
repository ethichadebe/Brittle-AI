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

// #103 / ADR 0005: when a pairing becomes a Popular Substitute. Raised by
// hand as the app grows, never scaled automatically — a pairing must not
// stop being popular just because more people signed up.
export const POPULAR_MIN_CHOICES = 3;
// Choices must outnumber removals by at least this much, so a pairing many
// Shoppers rejected isn't popular just because a few chose it.
export const POPULAR_CHOICE_RATIO = 2;
// Only Accounts at least this old count, so creating accounts isn't a way
// to make a pairing popular.
export const ESTABLISHED_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000;

// The Popular Substitute for each of these products at `toStore`, if one
// exists, keyed by the list item's productId. Every Shopper's current
// decision counts once; when two pairings qualify for one product, the one
// more Shoppers chose wins.
export async function loadPopular(
  fromStore: StoreSlug,
  toStore: StoreSlug,
  fromProductIds: string[]
): Promise<Map<string, { productId: string; name: string }>> {
  const rows = await prisma.substituteDecision.findMany({
    where: {
      fromStore,
      toStore,
      fromProductId: { in: fromProductIds },
      account: { createdAt: { lte: new Date(Date.now() - ESTABLISHED_ACCOUNT_AGE_MS) } },
    },
    select: { fromProductId: true, toProductId: true, toProductName: true, choice: true },
  });

  const tallies = new Map<string, { fromProductId: string; productId: string; name: string; chosen: number; removed: number }>();
  for (const row of rows) {
    const key = `${row.fromProductId}\u0000${row.toProductId}`;
    const tally = tallies.get(key) ?? {
      fromProductId: row.fromProductId,
      productId: row.toProductId,
      name: row.toProductName,
      chosen: 0,
      removed: 0,
    };
    if (row.choice === "chosen") tally.chosen++;
    else tally.removed++;
    tallies.set(key, tally);
  }

  const popular = new Map<string, { productId: string; name: string; chosen: number }>();
  for (const t of tallies.values()) {
    if (t.chosen < POPULAR_MIN_CHOICES || t.chosen < POPULAR_CHOICE_RATIO * t.removed) continue;
    const current = popular.get(t.fromProductId);
    if (!current || t.chosen > current.chosen) {
      popular.set(t.fromProductId, { productId: t.productId, name: t.name, chosen: t.chosen });
    }
  }
  return new Map([...popular].map(([from, { productId, name }]) => [from, { productId, name }]));
}
