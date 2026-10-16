import type { FastifyRequest } from "fastify";
import { prisma } from "./db.js";

// The Owner (CONTEXT.md): the one Account allowed to see how the whole app is
// doing. Chosen by OWNER_EMAIL in the server's .env, so it never sits in the
// repo or the database, and no other Account can be made the Owner.

export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
}

/** True only for a request signed in to the Owner's Account. */
export async function isOwner(req: FastifyRequest): Promise<boolean> {
  const owner = ownerEmail();
  if (!owner || !req.accountId) return false;
  const account = await prisma.account.findUnique({ where: { id: req.accountId }, select: { email: true } });
  return account?.email.trim().toLowerCase() === owner;
}
