import { describe, it, expect, afterAll } from "vitest";
import { testPrisma } from "../test/testDb.js";
import { databaseLedger } from "./creditLedger.js";

// #157: what the credit report reads.

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("the spend ledger", () => {
  it("counts by day and purpose", async () => {
    await databaseLedger.record("2026-10-06", "search");
    await databaseLedger.record("2026-10-06", "search");
    await databaseLedger.record("2026-10-06", "branch");
    await databaseLedger.record("2026-10-07", "search");

    const rows = await testPrisma.creditSpend.findMany({ orderBy: [{ day: "asc" }, { purpose: "asc" }] });
    expect(rows.map((r) => `${r.day} ${r.purpose}:${r.count}`)).toEqual([
      "2026-10-06 branch:1",
      "2026-10-06 search:2",
      "2026-10-07 search:1",
    ]);
  });
});
