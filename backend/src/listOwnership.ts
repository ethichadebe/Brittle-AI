import type { FastifyRequest } from "fastify";
import { prisma } from "./db.js";

// Every list belongs to exactly one Shopper. Before an Account exists, that
// is the device that created it (deviceId.ts); once signed in, it is the
// Account (#84) — lists move from one to the other at sign-in (#85), never
// looked up by both at once. This is that single key, so every route scopes
// a list the same way whether or not the caller is signed in.
export function ownerKey(req: FastifyRequest): string {
  return req.accountId ?? req.deviceId;
}

// A list whose owner does not match the caller is treated exactly like a
// list that does not exist: 404, not 403, so a probing request cannot tell
// "not yours" from "never existed".
//
// This also covers every list that existed before #82 shipped — their
// `userId` is `null`, which matches no device and no Account, so they became
// invisible to everyone rather than being deleted or claimed by whoever
// asks first.
export function findOwnedList(id: string, owner: string) {
  return prisma.list.findFirst({ where: { id, userId: owner } });
}
