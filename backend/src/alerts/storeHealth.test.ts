import { describe, it, expect } from "vitest";
import { createIncidents, memoryIncidentStore } from "./incidents.js";
import { createStoreHealth, FAILS_IN_A_ROW } from "./storeHealth.js";
import type { Notifier } from "./telegram.js";

function setup() {
  const sent: string[] = [];
  const notifier: Notifier = { send: async (t) => (sent.push(t), { ok: true }) };
  const health = createStoreHealth(createIncidents(memoryIncidentStore(), notifier, () => {}));
  return { sent, health };
}
const boom = new Error("Checkers API returned 403 Forbidden");

describe("store health alerts (#155)", () => {
  it(`stays quiet for ${FAILS_IN_A_ROW - 1} failures in a row, and alerts on the ${FAILS_IN_A_ROW}th`, async () => {
    const { sent, health } = setup();
    for (let i = 1; i < FAILS_IN_A_ROW; i++) await health.searched("checkers", boom);
    expect(sent).toEqual([]);
    await health.searched("checkers", boom);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Checkers: the last 5 searches failed");
    expect(sent[0]).toContain("403 Forbidden");
  });

  it("alerts once per incident, however long it lasts, then once when it works again", async () => {
    const { sent, health } = setup();
    for (let i = 0; i < 20; i++) await health.searched("shoprite", boom);
    await health.searched("shoprite");
    await health.searched("shoprite");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe("✅ Shoprite searches are working again.");
  });

  it("starts counting again after a success: scattered failures are not an incident", async () => {
    const { sent, health } = setup();
    for (let round = 0; round < 5; round++) {
      for (let i = 1; i < FAILS_IN_A_ROW; i++) await health.searched("makro", boom);
      await health.searched("makro");
    }
    expect(sent).toEqual([]);
  });

  it("keeps each store to itself", async () => {
    const { sent, health } = setup();
    for (let i = 0; i < FAILS_IN_A_ROW; i++) {
      await health.searched("checkers", boom);
      await health.searched("pick-n-pay");
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Checkers");
  });
});
