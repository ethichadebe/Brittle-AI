import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { SESSION_COOKIE } from "../accountSession.js";
import { limiter } from "../rateLimit.js";

// #87: signing out leaves the device a fresh anonymous identity with nothing
// behind it. A phone signed out at a shop counter must show the next person
// nothing: not the Account's lists, and not anything from before sign-in.

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

beforeEach(() => limiter.clear());

const PASSWORD = "correct horse battery staple";

// A browser: keeps whatever cookies the server sets, as a real one would.
function browser() {
  const cookies: Record<string, string> = { [DEVICE_ID_COOKIE]: randomUUID() };
  return {
    cookies,
    async send(opts: InjectOptions) {
      const res = await app.inject({ ...opts, cookies });
      for (const c of res.cookies) {
        if (c.value === "" || (c.expires && c.expires.getTime() <= Date.now())) delete cookies[c.name];
        else cookies[c.name] = c.value;
      }
      return res;
    },
  };
}

const names = async (b: ReturnType<typeof browser>) =>
  ((await b.send({ method: "GET", url: "/lists" })).json().lists as { name: string }[]).map((l) => l.name).sort();

describe("signing out on a shared device (#87)", () => {
  it("leaves the next person nothing of the Account, or of before it signed in", async () => {
    // The Shopper's Account, made on their own phone, with a list.
    const email = `shared-${randomUUID()}@example.com`;
    const own = browser();
    await signUp(own.send, { email, password: PASSWORD });
    await own.send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } });

    // A shared phone. Someone used it before, anonymously: one list the
    // sign-in will claim, and one that clashes with the Account's own
    // "Monthly", which claiming leaves on the device (#85, ADR 0003).
    const phone = browser();
    const before = phone.cookies[DEVICE_ID_COOKIE];
    await phone.send({ method: "POST", url: "/lists", payload: { storeSlug: "woolworths", name: "Party" } });
    await phone.send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } });

    const signIn = await phone.send({ method: "POST", url: "/accounts/sign-in", payload: { email, password: PASSWORD } });
    expect(signIn.statusCode).toBe(200);
    await phone.send({ method: "POST", url: "/lists", payload: { storeSlug: "makro", name: "Bulk" } });
    expect(await names(phone)).toEqual(["Bulk", "Monthly", "Party"]);

    const out = await phone.send({ method: "POST", url: "/accounts/sign-out" });
    expect(out.statusCode).toBe(204);

    // A new identity, signed out, with no lists at all: not the Account's,
    // and not the clashing list from before sign-in.
    expect(phone.cookies[SESSION_COOKIE]).toBeUndefined();
    expect(phone.cookies[DEVICE_ID_COOKIE]).toBeDefined();
    expect(phone.cookies[DEVICE_ID_COOKIE]).not.toBe(before);
    expect((await phone.send({ method: "GET", url: "/accounts/session" })).json()).toEqual({ account: null });
    expect(await names(phone)).toEqual([]);

    // Signing straight back in shows the Account's lists, as they were.
    await phone.send({ method: "POST", url: "/accounts/sign-in", payload: { email, password: PASSWORD } });
    expect(await names(phone)).toEqual(["Bulk", "Monthly", "Party"]);
    await phone.send({ method: "POST", url: "/accounts/sign-out" });
    expect(await names(phone)).toEqual([]);
  });

  it("an anonymous device signing out keeps its lists: there was no sign-in to undo", async () => {
    const phone = browser();
    const before = phone.cookies[DEVICE_ID_COOKIE];
    await phone.send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Mine" } });
    expect((await phone.send({ method: "POST", url: "/accounts/sign-out" })).statusCode).toBe(204);
    expect(phone.cookies[DEVICE_ID_COOKIE]).toBe(before);
    expect(await names(phone)).toEqual(["Mine"]);
  });
});
