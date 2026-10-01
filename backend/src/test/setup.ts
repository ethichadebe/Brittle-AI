import { beforeEach } from "vitest";
import { testPrisma } from "./testDb.js";

beforeEach(async () => {
  // Truncate all tables in dependency order before each test
  await testPrisma.listItem.deleteMany();
  await testPrisma.list.deleteMany();
  await testPrisma.substituteDecision.deleteMany();
  await testPrisma.session.deleteMany();
  await testPrisma.account.deleteMany();
  await testPrisma.priceCache.deleteMany();
  await testPrisma.searchCache.deleteMany();
});
