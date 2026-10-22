import { beforeEach } from "vitest";
import { testPrisma } from "./testDb.js";
import { limiter } from "../rateLimit.js";

beforeEach(async () => {
  // Truncate all tables in dependency order before each test
  await testPrisma.listItem.deleteMany();
  await testPrisma.list.deleteMany();
  await testPrisma.substituteDecision.deleteMany();
  await testPrisma.session.deleteMany();
  await testPrisma.passwordReset.deleteMany();
  await testPrisma.premiumCheckout.deleteMany();
  await testPrisma.premiumCharge.deleteMany();
  await testPrisma.subscription.deleteMany();
  await testPrisma.trialCard.deleteMany();
  await testPrisma.pendingSignup.deleteMany();
  await testPrisma.account.deleteMany();
  await testPrisma.priceCache.deleteMany();
  await testPrisma.searchCache.deleteMany();
  await testPrisma.rememberedValue.deleteMany();
  await testPrisma.creditSpend.deleteMany();
  await testPrisma.priceHistory.deleteMany();
  await testPrisma.searchLog.deleteMany();
  await testPrisma.compareLog.deleteMany();
  await testPrisma.shoppingEvent.deleteMany();
  await testPrisma.historyOptOut.deleteMany();
  // Rate limits (#152) belong to one test, not the run.
  limiter.clear();
});
