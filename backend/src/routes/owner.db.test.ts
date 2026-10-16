import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { OwnerDashboard } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { ownerDashboard } from "../services/ownerDashboard.js";

// The Owner's dashboard (2026-10-16): only the Owner's Account sees it, and to
// everyone else it isn't there at all.

let app: FastifyInstance;
const OWNER = `owner-${randomUUID()}@example.com`;
const PASSWORD = "correct horse battery staple";

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

const before = process.env.OWNER_EMAIL;
beforeEach(() => {
  process.env.OWNER_EMAIL = OWNER.toUpperCase();
});
afterEach(() => {
  process.env.OWNER_EMAIL = before;
});

// A browser: keeps whatever cookies the server sets.
function browser() {
  const cookies: Record<string, string> = { [DEVICE_ID_COOKIE]: randomUUID() };
  return {
    cookies,
    async send(opts: InjectOptions) {
      const res = await app.inject({ ...opts, cookies });
      for (const c of res.cookies) cookies[c.name] = c.value;
      return res;
    },
  };
}

async function signedIn(email: string) {
  const b = browser();
  expect((await signUp(b.send, { email, password: PASSWORD })).statusCode).toBe(201);
  return b;
}

describe("who can open it", () => {
  it("the Owner, by OWNER_EMAIL (any case)", async () => {
    const owner = await signedIn(OWNER);
    expect((await owner.send({ method: "GET", url: "/owner" })).statusCode).toBe(204);
    const res = await owner.send({ method: "GET", url: "/owner/dashboard" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("nobody else: they get the same answer as an address that doesn't exist", async () => {
    const unknown = await app.inject({ method: "GET", url: "/no-such-address" });
    const other = await signedIn(`someone-${randomUUID()}@example.com`);
    for (const send of [other.send, browser().send]) {
      for (const url of ["/owner", "/owner/dashboard"]) {
        const res = await send({ method: "GET", url });
        expect(res.statusCode, url).toBe(404);
        expect(res.json().error).toBe(unknown.json().error);
      }
    }
  });

  it("nobody at all while OWNER_EMAIL isn't set, the would-be Owner included", async () => {
    const owner = await signedIn(OWNER);
    process.env.OWNER_EMAIL = "";
    expect((await owner.send({ method: "GET", url: "/owner/dashboard" })).statusCode).toBe(404);
  });
});

describe("what it shows", () => {
  it("counts shoppers, lists and stores, names shoppers without their whole email, and never shows a list's name", async () => {
    const owner = await signedIn(OWNER);
    const thandi = `thandi-${randomUUID()}`;
    const shopper = await signedIn(`${thandi}@example.com`);
    await shopper.send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Secret braai list" } });
    const anon = browser();
    await anon.send({ method: "POST", url: "/lists", payload: { storeSlug: "woolworths", name: "Private things" } });
    await anon.send({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "More private things" } });
    // A sign-up that hasn't been confirmed yet.
    await app.inject({ method: "POST", url: "/accounts", payload: { email: `waiting-${randomUUID()}@example.com`, password: PASSWORD } });

    const res = await owner.send({ method: "GET", url: "/owner/dashboard" });
    const d = res.json() as OwnerDashboard;
    expect(d.shoppers).toMatchObject({ accounts: 2, newToday: 2, newThisWeek: 2, newThisMonth: 2, pendingSignups: 1, devicesWithoutAccount: 1 });
    expect(d.shoppers.signedInDevices).toBeGreaterThanOrEqual(2);
    expect(d.lists).toMatchObject({ lists: 3, items: 0, newThisWeek: 3 });
    expect(d.daily).toHaveLength(30);
    expect(d.daily[29]).toMatchObject({ accounts: 2, lists: 3 });
    expect(d.stores.find((s) => s.store === "checkers")?.lists).toBe(2);
    expect(d.stores.find((s) => s.store === "woolworths")?.lists).toBe(1);

    expect(d.activity.map((a) => a.kind)).toEqual(expect.arrayContaining(["account", "signup", "list"]));
    // Named like a username: the email before the @.
    expect(d.activity.some((a) => a.text === `${thandi} created an account`)).toBe(true);
    expect(d.activity.some((a) => a.text === "A list at Checkers, on an account")).toBe(true);
    expect(d.activity.some((a) => a.text === "A list at Woolworths, without an account")).toBe(true);
    // Nothing personal in the whole answer.
    expect(res.body).not.toContain("@");
    expect(res.body).not.toMatch(/braai|Private things/);
  });

  it("Premium: running, trials, cancelled, ended, and this month's payments", async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 10 * 86_400_000);
    const earlier = new Date(now.getTime() - 86_400_000);
    const make = async (sub: { plan: string; accessUntil: Date; trialEndsAt?: Date; cancelled?: boolean }) => {
      const account = await testPrisma.account.create({ data: { email: `p-${randomUUID()}@example.com`, passwordHash: "x" } });
      await testPrisma.subscription.create({ data: { accountId: account.id, ...sub } });
      return account;
    };
    const paid = await make({ plan: "monthly", accessUntil: later });
    await make({ plan: "monthly", accessUntil: later, trialEndsAt: later });
    await make({ plan: "yearly", accessUntil: later, cancelled: true });
    await make({ plan: "monthly", accessUntil: earlier });
    await testPrisma.premiumCharge.create({ data: { reference: randomUUID(), accountId: paid.id } });
    await testPrisma.premiumCheckout.create({
      data: { reference: randomUUID(), accountId: paid.id, plan: "yearly", purpose: "subscribe", handledAt: now, outcome: "subscribed" },
    });

    const d = await ownerDashboard(now);
    expect(d.premium).toMatchObject({
      active: 2,
      trialing: 1,
      cancelledRunning: 1,
      ended: 1,
      checkoutsStarted30d: 1,
      checkoutsFinished30d: 1,
      paymentsThisMonth: 2,
      estimatedIncomeCentsThisMonth: 2900 + 24900,
    });
    expect(d.activity.map((a) => a.kind)).toEqual(expect.arrayContaining(["checkout", "premium", "renewal"]));
  });

  it("credits per day, open alerts only, and the tables' sizes", async () => {
    const now = new Date("2026-10-16T08:00:00Z");
    await testPrisma.creditSpend.createMany({
      data: [
        { day: "2026-10-16", purpose: "search", count: 12 },
        { day: "2026-10-16", purpose: "branch", count: 3 },
        { day: "2026-10-01", purpose: "search", count: 5 },
        { day: "2026-09-30", purpose: "search", count: 40 },
      ],
    });
    await testPrisma.rememberedValue.createMany({
      data: [
        { key: "alert:disk", value: { level: 1 }, savedAt: now },
        { key: "alert:credits", value: { level: 0 }, savedAt: now },
        { key: "branch:checkers", value: { name: "not an alert" }, savedAt: now },
      ],
    });

    const d = await ownerDashboard(now);
    expect(d.credits.days.at(-1)).toEqual({ day: "2026-10-16", total: 15, byPurpose: { search: 12, branch: 3 } });
    expect(d.credits.thisMonth).toBe(20);
    expect(d.credits.days.find((x) => x.day === "2026-09-30")?.total).toBe(40);
    expect(d.alerts).toEqual([{ key: "disk", level: 1 }]);
    expect(d.tables.map((t) => t.table)).toEqual(expect.arrayContaining(["accounts", "lists", "price_cache"]));
    expect(d.tables.map((t) => t.table)).not.toContain("_prisma_migrations");
    expect(d.databaseBytes).toBeGreaterThan(0);
  });

  it("counts days in South African time", async () => {
    // 23:30 on the 15th in UTC is already 01:30 on the 16th in Johannesburg.
    await testPrisma.account.create({ data: { email: `late-${randomUUID()}@example.com`, passwordHash: "x", createdAt: new Date("2026-10-15T23:30:00Z") } });
    const d = await ownerDashboard(new Date("2026-10-16T08:00:00Z"));
    expect(d.daily.at(-1)).toMatchObject({ day: "2026-10-16", accounts: 1 });
    expect(d.shoppers.newToday).toBe(1);
  });
});
