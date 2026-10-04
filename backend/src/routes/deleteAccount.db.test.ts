import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { SESSION_COOKIE } from "../accountSession.js";
import { LIMITS, limiter } from "../rateLimit.js";

// #151: a Shopper deletes their Account, and nothing of it stays behind.

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

// An Account with something in every place an Account keeps data: a list
// with an item, a remembered substitute decision, and a session.
async function shopperWithData() {
  const b = browser();
  const email = `delete-me-${randomUUID()}@example.com`;
  const signedUp = await signUp(b.send, { email, password: PASSWORD });
  expect(signedUp.statusCode).toBe(201);
  const accountId: string = signedUp.json().id;
  // An unused reset link (#149), which must go with the account.
  await b.send({ method: "POST", url: "/accounts/password-reset", payload: { email } });
  expect(await testPrisma.passwordReset.count({ where: { accountId } })).toBe(1);
  const list = (await b.send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } })).json();
  const item = await testPrisma.listItem.create({
    data: { listId: list.id, productId: "milk-1", productName: "Milk 2L", imageUrl: "", regularPrice: 30, loyaltyPrice: null },
  });
  await testPrisma.substituteDecision.create({
    data: { accountId, fromStore: "checkers", fromProductId: "milk-1", toStore: "pick-n-pay", toProductId: "pnp-milk", toProductName: "PnP Milk 2L", choice: "chosen" },
  });
  return { b, email, accountId, listId: list.id as string, itemId: item.id, deviceId: b.cookies[DEVICE_ID_COOKIE] };
}

const remove = (b: ReturnType<typeof browser>, password: string) =>
  b.send({ method: "DELETE", url: "/accounts/me", payload: { password } });

// Every table in the database, whatever it is called, searched for a value.
// New tables are covered without this test being touched.
async function tablesContaining(needles: string[]): Promise<string[]> {
  const tables = await testPrisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
  expect(tables.length).toBeGreaterThanOrEqual(7);
  const found: string[] = [];
  for (const { table_name } of tables) {
    for (const needle of needles) {
      const rows = await testPrisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table_name}" t WHERE row_to_json(t)::text LIKE '%' || $1 || '%'`,
        needle
      );
      if (rows[0].n > 0n) found.push(`${table_name} has ${needle}`);
    }
  }
  return found;
}

describe("deleting an account (#151)", () => {
  it("needs the account's password", async () => {
    const { b, accountId } = await shopperWithData();

    const res = await remove(b, "not my password");

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("That password isn't right");
    expect(await testPrisma.account.findUnique({ where: { id: accountId } })).not.toBeNull();
  });

  it("needs to be signed in", async () => {
    expect((await remove(browser(), PASSWORD)).statusCode).toBe(401);
  });

  it("leaves nothing of the account anywhere in the database", async () => {
    const { b, email, accountId, listId, itemId } = await shopperWithData();
    const sessionId = b.cookies[SESSION_COOKIE];
    // The check itself finds them while they exist, so an empty answer later means something.
    expect(await tablesContaining([accountId, listId])).toEqual(
      expect.arrayContaining(["accounts has " + accountId, "lists has " + listId, "sessions has " + accountId, "substitute_decisions has " + accountId, "password_resets has " + accountId])
    );

    expect((await remove(b, PASSWORD)).statusCode).toBe(204);

    expect(await tablesContaining([accountId, email, listId, itemId, sessionId])).toEqual([]);
  });

  it("leaves other shoppers' data alone", async () => {
    const other = await shopperWithData();
    const { b } = await shopperWithData();

    await remove(b, PASSWORD);

    expect(await testPrisma.account.findUnique({ where: { id: other.accountId } })).not.toBeNull();
    expect(await testPrisma.list.findUnique({ where: { id: other.listId } })).not.toBeNull();
    expect(await testPrisma.substituteDecision.count({ where: { accountId: other.accountId } })).toBe(1);
  });

  it("signs the device out, with a fresh anonymous identity and no lists", async () => {
    const { b, deviceId } = await shopperWithData();

    await remove(b, PASSWORD);

    expect(b.cookies[SESSION_COOKIE]).toBeUndefined();
    expect(b.cookies[DEVICE_ID_COOKIE]).toBeDefined();
    expect(b.cookies[DEVICE_ID_COOKIE]).not.toBe(deviceId);
    expect((await b.send({ method: "GET", url: "/accounts/session" })).json()).toEqual({ account: null });
    expect((await b.send({ method: "GET", url: "/lists" })).json().lists).toEqual([]);
  });

  it("frees the email: signing in fails, signing up again starts empty", async () => {
    const { b, email } = await shopperWithData();
    await remove(b, PASSWORD);

    expect((await browser().send({ method: "POST", url: "/accounts/sign-in", payload: { email, password: PASSWORD } })).statusCode).toBe(401);
    const again = browser();
    expect((await signUp(again.send, { email, password: PASSWORD })).statusCode).toBe(201);
    expect((await again.send({ method: "GET", url: "/lists" })).json().lists).toEqual([]);
  });

  it("an old session cookie for it is just signed out", async () => {
    const { b } = await shopperWithData();
    const stale = b.cookies[SESSION_COOKIE];
    await remove(b, PASSWORD);

    const res = await app.inject({ method: "GET", url: "/accounts/session", cookies: { [SESSION_COOKIE]: stale } });
    expect(res.json()).toEqual({ account: null });
  });

  it("counts wrong passwords against the sign-in limit", async () => {
    const { b, accountId } = await shopperWithData();
    let last = 0;
    for (let i = 0; i <= LIMITS.signInPerEmail[0].max; i++) last = (await remove(b, `guess-${i}`)).statusCode;
    expect(last).toBe(429);
    expect(await testPrisma.account.findUnique({ where: { id: accountId } })).not.toBeNull();
  });
});
