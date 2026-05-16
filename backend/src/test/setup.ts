import { beforeEach } from "vitest";
import { testPrisma } from "./testDb.js";

beforeEach(async () => {
  // Truncate all tables in dependency order before each test
  await testPrisma.listItem.deleteMany();
  await testPrisma.list.deleteMany();
});
