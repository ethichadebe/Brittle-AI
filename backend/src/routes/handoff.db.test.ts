import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { clearHandoffs } from "../handoff.js";

// #200: the app moves to a new address, and a shopper without an account,
// known only by a cookie on the old one, keeps their lists.
const NEW = "https://accucery.example";
const OLD_HOST = "accucery.old.example";

let app: FastifyInstance;

beforeAll(async () => {
  vi.stubEnv("FRONTEND_URL", NEW);
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await app.close();
  await testPrisma.$disconnect();
});

beforeEach(() => clearHandoffs());

type Send = (opts: InjectOptions) => Promise<LightMyRequestResponse>;
const asDevice = (deviceId: string, host = OLD_HOST): Send => (opts) =>
  app.inject({ ...opts, headers: { host, ...opts.headers }, cookies: { [DEVICE_ID_COOKIE]: deviceId, ...opts.cookies } });

/** The device id the response leaves the browser with, if it sets one. */
const deviceCookie = (res: LightMyRequestResponse) => res.cookies.filter((c) => c.name === DEVICE_ID_COOKIE).at(-1)?.value;

async function makeList(send: Send, name: string): Promise<string> {
  const res = await send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name } });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

async function listIds(send: Send): Promise<string[]> {
  return (await send({ method: "GET", url: "/lists" })).json().lists.map((l: { id: string }) => l.id);
}

/** Opens a page on the old address and follows the handover to the new one. */
async function moveOver(oldSend: Send, page: string, newCookies: Record<string, string> = {}) {
  const sent = await oldSend({ method: "GET", url: "/handoff/send", headers: { "x-handoff-to": page } });
  expect(sent.statusCode).toBe(302);
  const location = new URL(sent.headers.location as string);
  const received = await app.inject({
    method: "GET",
    url: location.pathname.replace(/^\/api/, "") + location.search,
    headers: { host: "accucery.example" },
    cookies: newCookies,
  });
  return { sent, location, received };
}

describe("moving to the new address", () => {
  it("brings a shopper's lists with them, and lands on the page they asked for", async () => {
    const oldId = randomUUID();
    const old = asDevice(oldId);
    const listId = await makeList(old, "Weekly shop");

    const { location, received } = await moveOver(old, "/lists/" + listId + "?tab=compare");
    expect(location.origin).toBe(NEW);
    expect(location.pathname).toBe("/api/handoff/receive");
    expect(location.search).not.toContain(oldId);

    expect(received.statusCode).toBe(302);
    expect(received.headers.location).toBe("/lists/" + listId + "?tab=compare");
    const carried = deviceCookie(received)!;
    expect(carried).toBe(oldId);
    expect(await listIds(asDevice(carried, "accucery.example"))).toContain(listId);
  });

  it("works once: the same code again carries nothing", async () => {
    const oldId = randomUUID();
    const old = asDevice(oldId);
    await makeList(old, "Once");
    const { location, received } = await moveOver(old, "/");
    expect(deviceCookie(received)).toBe(oldId);
    const again = await app.inject({ method: "GET", url: location.pathname.replace(/^\/api/, "") + location.search, headers: { host: "accucery.example" } });
    expect(again.statusCode).toBe(302);
    // A fresh identity, as for any new visitor: not the one handed over.
    expect(deviceCookie(again)).toBeDefined();
    expect(deviceCookie(again)).not.toBe(oldId);
  });

  it("never replaces a browser's own lists at the new address", async () => {
    const old = asDevice(randomUUID());
    await makeList(old, "Old address");
    const newId = randomUUID();
    const mine = await makeList(asDevice(newId, "accucery.example"), "New address");

    const { received } = await moveOver(old, "/", { [DEVICE_ID_COOKIE]: newId });
    expect(deviceCookie(received)).toBeUndefined();
    expect(await listIds(asDevice(newId, "accucery.example"))).toEqual([mine]);
  });

  it("never replaces a signed-in shopper's identity", async () => {
    const old = asDevice(randomUUID());
    await makeList(old, "Old address");
    const newId = randomUUID();
    const fresh = asDevice(newId, "accucery.example");
    const signedIn = await signUp(fresh, { email: `handoff-${randomUUID()}@example.com`, password: "a long enough password" });
    const session = signedIn.cookies.find((c) => c.name === "accucery_session")!;

    const { received } = await moveOver(old, "/", { [DEVICE_ID_COOKIE]: newId, accucery_session: session.value });
    expect(deviceCookie(received)).toBeUndefined();
  });

  it("sends a browser with no identity straight on", async () => {
    const res = await app.inject({ method: "GET", url: "/handoff/send", headers: { host: OLD_HOST, "x-handoff-to": "/welcome" } });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(NEW + "/welcome");
  });

  it("never forwards to another site", async () => {
    const res = await asDevice(randomUUID())({ method: "GET", url: "/handoff/send", headers: { "x-handoff-to": "//evil.example/x" } });
    expect(new URL(res.headers.location as string).searchParams.get("to")).toBe("/");
    const received = await app.inject({ method: "GET", url: "/handoff/receive?code=nope&to=//evil.example", headers: { host: "accucery.example" } });
    expect(received.headers.location).toBe("/");
  });

  it("refuses to forward the new address to itself", async () => {
    const res = await asDevice(randomUUID(), "accucery.example")({ method: "GET", url: "/handoff/send" });
    expect(res.statusCode).toBe(409);
  });

  it("serves the old address a service worker that removes itself", async () => {
    const res = await app.inject({ method: "GET", url: "/handoff/sw.js", headers: { host: OLD_HOST } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.body).toContain("unregister()");
  });
});
