import { describe, it, expect, afterAll } from "vitest";
import { testPrisma } from "../test/testDb.js";
import { databaseStore } from "./rememberedStore.js";

// #157: what a deploy's restart reads back.

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("the database store", () => {
  it("saves a branch and reads it back, with when it was saved", async () => {
    const store = databaseStore<{ storeId: string }[]>("default-branch:Test");
    expect(await store.load()).toBeNull();

    const before = Date.now();
    await store.save([{ storeId: "store-sophiatown" }]);
    const kept = await store.load();

    expect(kept?.value).toEqual([{ storeId: "store-sophiatown" }]);
    expect(kept!.savedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("a later save replaces the earlier one", async () => {
    const store = databaseStore<string>("default-branch:Again");
    await store.save("first");
    await store.save("second");
    expect((await store.load())?.value).toBe("second");
    expect(await testPrisma.rememberedValue.count({ where: { key: "default-branch:Again" } })).toBe(1);
  });
});
