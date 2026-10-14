import { describe, it, expect } from "vitest";
import { checkDisk, diskLevel, diskMessage, rootDisk } from "./diskAlerts.js";
import { createIncidents, memoryIncidentStore } from "./incidents.js";
import type { Notifier } from "./telegram.js";

const GB = 1e9;
// A 100 GB disk with `pct` percent used.
const disk = (pct: number) => async () => ({ used: pct * GB, free: (100 - pct) * GB });

describe("disk space alerts", () => {
  it("warns from 85% and alerts from 95%", () => {
    expect(diskLevel(0.84, 0)).toBe(0);
    expect(diskLevel(0.85, 0)).toBe(1);
    expect(diskLevel(0.95, 0)).toBe(2);
  });

  it("stays warned until the disk is back under 80%", () => {
    expect(diskLevel(0.82, 1)).toBe(1);
    expect(diskLevel(0.82, 2)).toBe(1);
    expect(diskLevel(0.79, 1)).toBe(0);
  });

  it("says how full, and how much is left", () => {
    expect(diskMessage(1, { used: 86 * GB, free: 14 * GB })).toBe(
      "⚠️ The server's disk is filling up: 86% used, 14.0 GB free. See docs/server-upkeep.md, \"The disk\"."
    );
    expect(diskMessage(2, { used: 97 * GB, free: 3 * GB })).toMatch(/^🚨 .*97% used, 3\.0 GB free/);
    expect(diskMessage(0, { used: 60 * GB, free: 40 * GB })).toMatch(/^✅ .*60% used/);
  });

  it("over weeks: one warning, one alert, one all-clear, however long it hovers", async () => {
    const sent: string[] = [];
    const notifier: Notifier = { send: async (t) => (sent.push(t), { ok: true }) };
    const incidents = createIncidents(memoryIncidentStore(), notifier, () => {});
    for (const pct of [50, 70, 84, 85, 84, 86, 84, 85, 90, 96, 99, 90, 85, 82, 81, 79, 60]) {
      await checkDisk(incidents, disk(pct));
    }
    expect(sent).toHaveLength(3);
    expect(sent[0]).toMatch(/^⚠️ .*85% used/);
    expect(sent[1]).toMatch(/^🚨 .*96% used/);
    expect(sent[2]).toMatch(/^✅ .*79% used/);
  });

  it("after a restart, remembers it had warned", async () => {
    const sent: string[] = [];
    const notifier: Notifier = { send: async (t) => (sent.push(t), { ok: true }) };
    const store = memoryIncidentStore();
    await checkDisk(createIncidents(store, notifier, () => {}), disk(86));
    // A deploy: a new process, the same database.
    await checkDisk(createIncidents(store, notifier, () => {}), disk(82));
    expect(sent).toHaveLength(1);
  });

  it("reads a real disk", async () => {
    const use = await rootDisk();
    expect(use.used).toBeGreaterThan(0);
    expect(use.free).toBeGreaterThanOrEqual(0);
  });
});
