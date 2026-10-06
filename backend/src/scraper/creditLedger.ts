import { prisma } from "../db.js";
import type { CreditLedger } from "./creditBudget.js";

// #157: ScraperAPI spend, by day and purpose, in the database. It survives
// restarts (a deploy mustn't reset the day's allowance), and it's what the
// credit report reads to measure spend before and after.
export const databaseLedger: CreditLedger = {
  async spentOn(day) {
    const { _sum } = await prisma.creditSpend.aggregate({ where: { day }, _sum: { count: true } });
    return _sum.count ?? 0;
  },
  async record(day, purpose) {
    await prisma.creditSpend.upsert({
      where: { day_purpose: { day, purpose } },
      create: { day, purpose, count: 1 },
      update: { count: { increment: 1 } },
    });
  },
};
