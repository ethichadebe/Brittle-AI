import { describe, it, expect } from "vitest";
import { createErrorWatch, SPIKE, QUIET_MS } from "./serverErrors.js";
import { createIncidents, memoryIncidentStore, type IncidentStore } from "./incidents.js";
import type { Notifier } from "./telegram.js";

const MINUTE = 60_000;

function setup(store: IncidentStore = memoryIncidentStore()) {
  let now = 1_000_000_000;
  const sent: string[] = [];
  const notifier: Notifier = { send: async (t) => (sent.push(t), { ok: true }) };
  const watch = createErrorWatch(createIncidents(store, notifier, () => {}), () => now);
  return { watch, sent, advance: (ms: number) => (now += ms) };
}

describe("server error alerts", () => {
  it("say nothing about the odd error, or about refusals and missing pages", async () => {
    const { watch, sent, advance } = setup();
    for (let i = 0; i < 50; i++) {
      await watch.responded(i % 2 ? 404 : 429, "/search");
      await watch.responded(200, "/lists");
    }
    // Errors spread out: never SPIKE within five minutes.
    for (let i = 0; i < 30; i++) {
      await watch.responded(500, "/lists");
      advance(MINUTE);
    }
    expect(sent).toEqual([]);
  });

  it("alert once on a burst, naming the routes, then once when it's been quiet", async () => {
    const { watch, sent, advance } = setup();
    for (let i = 0; i < 40; i++) {
      await watch.responded(i % 4 ? 500 : 502, i % 4 ? "/lists/:listId" : "/accounts");
      advance(1_000);
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^🚨 Accucery is answering with errors: 10 in the last 5 minutes\./);
    expect(sent[0]).toContain("Mostly: /lists/:listId (500) ×7, /accounts (502) ×3");

    // Still erroring now and then: no all-clear yet.
    advance(10 * MINUTE);
    await watch.responded(500, "/lists");
    advance(10 * MINUTE);
    await watch.check();
    expect(sent).toHaveLength(1);

    advance(QUIET_MS);
    await watch.check();
    await watch.check();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatch(/^✅ .*none in the last 15 minutes/);
  });

  it("alert again on a later burst", async () => {
    const { watch, sent, advance } = setup();
    const burst = async () => {
      for (let i = 0; i < SPIKE; i++) await watch.responded(500, "/search");
    };
    await burst();
    advance(QUIET_MS);
    await watch.check();
    await burst();
    expect(sent.map((t) => [...t][0])).toEqual(["🚨", "✅", "🚨"]);
  });

  it("after a restart mid-incident, still send the all-clear", async () => {
    const store = memoryIncidentStore();
    const before = setup(store);
    for (let i = 0; i < SPIKE; i++) await before.watch.responded(500, "/search");
    // A deploy: a new process, the same database, and a quiet new version.
    const after = setup(store);
    after.advance(QUIET_MS - MINUTE);
    await after.watch.check();
    expect(after.sent).toEqual([]);
    after.advance(MINUTE);
    await after.watch.check();
    expect([...before.sent, ...after.sent].map((t) => [...t][0])).toEqual(["🚨", "✅"]);
  });
});

describe("the app", () => {
  it("reports every response, by method and route pattern, never the address asked for", async () => {
    const { buildApp } = await import("../app.js");
    const { observeResponses } = await import("./serverErrors.js");
    const seen: [number, string][] = [];
    observeResponses((status, route) => seen.push([status, route]));
    const app = await buildApp();
    app.get("/boom/:id", async () => {
      throw new Error("a bug");
    });
    try {
      await app.inject({ method: "GET", url: "/health" });
      await app.inject({ method: "GET", url: "/boom/someone@example.com" });
      await app.inject({ method: "GET", url: "/nothing-here" });
    } finally {
      observeResponses(() => {});
      await app.close();
    }
    expect(seen).toEqual([
      [200, "GET /health"],
      [500, "GET /boom/:id"],
      [404, "GET (no route)"],
    ]);
  });
});
