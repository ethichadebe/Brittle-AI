import { describe, it, expect, afterAll } from "vitest";
import { testPrisma } from "./test/testDb.js";
import { deleteExpiredLinks } from "./expiredLinks.js";

// #148, #149: what the privacy notice promises about unconfirmed sign-ups.

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("the hourly sweep", () => {
  it("deletes expired sign-ups and reset links, and leaves live ones", async () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    const account = await testPrisma.account.create({ data: { email: "sweep@example.com", passwordHash: "x:y" } });
    await testPrisma.pendingSignup.createMany({
      data: [
        { tokenHash: "old-signup", email: "gone@example.com", passwordHash: "x:y", expiresAt: past },
        { tokenHash: "live-signup", email: "kept@example.com", passwordHash: "x:y", expiresAt: future },
      ],
    });
    await testPrisma.passwordReset.createMany({
      data: [
        { tokenHash: "old-reset", accountId: account.id, expiresAt: past },
        { tokenHash: "live-reset", accountId: account.id, expiresAt: future },
      ],
    });

    await deleteExpiredLinks();

    expect((await testPrisma.pendingSignup.findMany()).map((p) => p.tokenHash)).toEqual(["live-signup"]);
    expect((await testPrisma.passwordReset.findMany()).map((p) => p.tokenHash)).toEqual(["live-reset"]);
  });
});
