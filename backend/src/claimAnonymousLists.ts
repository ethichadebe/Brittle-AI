import { prisma } from "./db.js";

// Per ADR 0003: signing in claims whatever lists exist on the device's
// anonymous identity, except where a list collides with one already on the
// Account — same name, same Store. A collision is left untouched here and
// handed to #86's prompt instead, because combining them sums quantities
// (see #83) and that cannot be undone; deciding to combine belongs to the
// Shopper, not to this function.
//
// Called after every sign-up and sign-in — a brand-new Account from sign-up
// has no lists of its own, so every anonymous list transfers with no
// collision possible; that is the same code path, not a special case.
export async function claimAnonymousLists(deviceId: string, accountId: string): Promise<void> {
  const anonymousLists = await prisma.list.findMany({
    where: { userId: deviceId },
    select: { id: true, name: true, storeSlug: true },
  });
  if (anonymousLists.length === 0) return;

  const accountLists = await prisma.list.findMany({
    where: { userId: accountId },
    select: { name: true, storeSlug: true },
  });
  const collisionKey = (l: { name: string; storeSlug: string }) => `${l.storeSlug}::${l.name}`;
  const taken = new Set(accountLists.map(collisionKey));

  const toClaim = anonymousLists.filter((l) => !taken.has(collisionKey(l)));
  if (toClaim.length === 0) return;

  await prisma.list.updateMany({
    where: { id: { in: toClaim.map((l) => l.id) } },
    data: { userId: accountId },
  });
}
