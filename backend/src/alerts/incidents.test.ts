import { describe, it, expect } from "vitest";
import { createIncidents, memoryIncidentStore } from "./incidents.js";
import type { Notifier } from "./telegram.js";

function phone(fail = false) {
  const sent: string[] = [];
  const notifier: Notifier & { sent: string[]; fail: boolean } = {
    sent,
    fail,
    async send(text) {
      if (this.fail) return { ok: false, error: "Telegram down" };
      sent.push(text);
      return { ok: true };
    },
  };
  return notifier;
}

describe("incidents: once each, and once more when fixed (#155)", () => {
  it("speaks when it goes wrong, not again while it stays wrong, and once when it's fixed", async () => {
    const p = phone();
    const incidents = createIncidents(memoryIncidentStore(), p, () => {});
    await incidents.set("store:checkers", 1, "down");
    await incidents.set("store:checkers", 1, "down");
    await incidents.set("store:checkers", 1, "down");
    await incidents.set("store:checkers", 0, "fixed");
    await incidents.set("store:checkers", 0, "fixed");
    expect(p.sent).toEqual(["down", "fixed"]);
  });

  it("speaks again when it gets worse, and quietly when it gets a little better", async () => {
    const p = phone();
    const incidents = createIncidents(memoryIncidentStore(), p, () => {});
    await incidents.set("credits", 1, "80%");
    await incidents.set("credits", 2, "95%");
    await incidents.set("credits", 1, "80% again");
    await incidents.set("credits", 0, "renewed");
    expect(p.sent).toEqual(["80%", "95%", "renewed"]);
  });

  it("says nothing on recovery from a problem it never reported", async () => {
    const p = phone();
    await createIncidents(memoryIncidentStore(), p, () => {}).set("store:makro", 0, "fixed");
    expect(p.sent).toEqual([]);
  });

  it("doesn't repeat itself after a restart: what was said is kept", async () => {
    const store = memoryIncidentStore();
    const before = phone();
    await createIncidents(store, before, () => {}).set("store:clicks", 1, "down");
    const after = phone();
    const restarted = createIncidents(store, after, () => {});
    await restarted.set("store:clicks", 1, "down");
    expect(after.sent).toEqual([]);
    await restarted.set("store:clicks", 0, "fixed");
    expect(after.sent).toEqual(["fixed"]);
  });

  it("tries again next time if Telegram couldn't be reached, rather than going quiet", async () => {
    const p = phone(true);
    const logged: string[] = [];
    const incidents = createIncidents(memoryIncidentStore(), p, (m) => logged.push(m));
    await incidents.set("store:shoprite", 1, "down");
    expect(p.sent).toEqual([]);
    expect(logged[0]).toContain("Telegram down");
    p.fail = false;
    await incidents.set("store:shoprite", 1, "down");
    expect(p.sent).toEqual(["down"]);
  });

  it("sends one message when many failures land at once", async () => {
    const p = phone();
    const incidents = createIncidents(memoryIncidentStore(), p, () => {});
    await Promise.all(Array.from({ length: 10 }, () => incidents.set("store:pnp", 1, "down")));
    expect(p.sent).toEqual(["down"]);
  });
});
