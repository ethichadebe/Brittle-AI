import { prisma } from "./db.js";

// Every list belongs to exactly one Shopper — today, the device that created
// it (see deviceId.ts); later, whichever Account claimed it (#84/#85). A list
// whose owner does not match the caller is treated exactly like a list that
// does not exist: 404, not 403, so a probing request cannot tell "not yours"
// from "never existed".
//
// This also covers every list that existed before this feature shipped —
// their `userId` is `null`, which matches no device, so they become invisible
// to everyone rather than being deleted or claimed by whoever asks first.
export function findOwnedList(id: string, deviceId: string) {
  return prisma.list.findFirst({ where: { id, userId: deviceId } });
}
