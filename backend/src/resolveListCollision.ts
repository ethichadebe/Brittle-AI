import { prisma } from "./db.js";

export type CollisionResolution = "combine" | "keep-both";

// Appends " (2)", " (3)", ... until the name is free among the Account's
// own lists for that Store. Only ever called for a name that already
// collided once, so " (2)" is the common case; the loop exists for the
// less common one where that is taken too.
function disambiguate(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

// Resolves one collision left behind by #85's claimAnonymousLists. The
// anonymous list must belong to this exact device, and the target must
// belong to this exact Account — recomputed here rather than trusted from
// whatever the sign-in response said, in case either side changed since.
//
// "combine" merges items into the Account's existing list using the same
// same-product-sums-quantity rule as #83, then discards the now-empty
// anonymous list. "keep-both" instead claims the anonymous list onto the
// Account under a disambiguated name, so both are visible and neither is
// silently altered — this is also what a dismissed prompt falls back to,
// per #86, because nothing here can be undone once items are merged.
export async function resolveListCollision(
  deviceId: string,
  accountId: string,
  anonymousListId: string,
  resolution: CollisionResolution
): Promise<boolean> {
  const anonymousList = await prisma.list.findFirst({
    where: { id: anonymousListId, userId: deviceId },
    include: { items: true },
  });
  if (!anonymousList) return false;

  const accountList = await prisma.list.findFirst({
    where: { userId: accountId, name: anonymousList.name, storeSlug: anonymousList.storeSlug },
    include: { items: true },
  });
  if (!accountList) return false; // nothing to resolve — already handled, or renamed away

  if (resolution === "combine") {
    const byProductId = new Map(accountList.items.map((i) => [i.productId, i]));

    for (const item of anonymousList.items) {
      const existing = byProductId.get(item.productId);
      if (existing) {
        await prisma.listItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + item.quantity },
        });
      } else {
        await prisma.listItem.update({
          where: { id: item.id },
          data: { listId: accountList.id },
        });
      }
    }

    await prisma.list.delete({ where: { id: anonymousList.id } });
    return true;
  }

  // keep-both
  const siblingNames = await prisma.list.findMany({
    where: { userId: accountId, storeSlug: anonymousList.storeSlug },
    select: { name: true },
  });
  const takenNames = new Set(siblingNames.map((l) => l.name));
  const newName = disambiguate(anonymousList.name, takenNames);

  await prisma.list.update({
    where: { id: anonymousList.id },
    data: { userId: accountId, name: newName },
  });
  return true;
}
