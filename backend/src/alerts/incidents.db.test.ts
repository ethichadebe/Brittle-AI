import { describe, it, expect, afterAll } from "vitest";
import { testPrisma } from "../test/testDb.js";
import { createIncidents, databaseIncidentStore } from "./incidents.js";
import type { Notifier } from "./telegram.js";

// #155: what's been said survives a restart, which every deploy is.

afterAll(async () => {
  await testPrisma.$disconnect();
});

const phone = () => {
  const sent: string[] = [];
  const notifier: Notifier = { send: async (t) => (sent.push(t), { ok: true }) };
  return { sent, notifier };
};

describe("incidents kept in the database", () => {
  it("an open incident isn't announced again after a restart, and its recovery still is", async () => {
    const first = phone();
    await createIncidents(databaseIncidentStore(), first.notifier, () => {}).set("store:checkers", 1, "down");
    expect(first.sent).toEqual(["down"]);
    expect((await testPrisma.rememberedValue.findUnique({ where: { key: "alert:store:checkers" } }))?.value).toEqual({ level: 1 });

    const second = phone();
    const restarted = createIncidents(databaseIncidentStore(), second.notifier, () => {});
    await restarted.set("store:checkers", 1, "down");
    expect(second.sent).toEqual([]);
    await restarted.set("store:checkers", 0, "fixed");
    expect(second.sent).toEqual(["fixed"]);
    expect((await testPrisma.rememberedValue.findUnique({ where: { key: "alert:store:checkers" } }))?.value).toEqual({ level: 0 });
  });
});
