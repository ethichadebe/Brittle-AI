import { prisma } from "./db.js";

// #148, #149: an unconfirmed sign-up holds an email and a password hash, so
// it goes once its link has expired, not whenever someone next signs up.
export async function deleteExpiredLinks(now = new Date()): Promise<void> {
  await prisma.pendingSignup.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } });
}

const HOUR = 60 * 60 * 1000;

/** Started with the server. A failed sweep is logged and tried again next hour. */
export function sweepExpiredLinksHourly(log: (err: unknown) => void): void {
  setInterval(() => deleteExpiredLinks().catch(log), HOUR).unref();
}
