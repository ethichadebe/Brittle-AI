import { prisma } from "../db.js";
import type { CreditLedger } from "./credits.js";

// #157: ScraperAPI spend, by day and purpose, in the database. It survives
// restarts, and it's what the credit report reads to measure spend.
export const databaseLedger: CreditLedger = {
  async record(day, purpose) {
    await prisma.creditSpend.upsert({
      where: { day_purpose: { day, purpose } },
      create: { day, purpose, count: 1 },
      update: { count: { increment: 1 } },
    });
  },
};
