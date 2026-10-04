import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Product } from "@accucery/types";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { LIMITS, limiter } from "../rateLimit.js";

// #152 and #153. Only the store is faked.
vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn(),
  nearestBranch: vi.fn(),
}));

import { searchProducts, currentZone, nearestBranch } from "../scraper/engine.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
  limiter.clear();
  vi.mocked(currentZone).mockResolvedValue("none");
  vi.mocked(searchProducts).mockResolvedValue([]);
});

const asDevice = (deviceId = randomUUID()) => (opts: InjectOptions) =>
  app.inject({ ...opts, cookies: { [DEVICE_ID_COOKIE]: deviceId } });

describe("sign-in attempts (#152)", () => {
  it("pause an email after too many tries, with Retry-After, from any device", async () => {
    const email = `guess-${randomUUID()}@example.com`;
    for (let i = 0; i < LIMITS.signInPerEmail[0].max; i++) {
      const res = await asDevice()({ method: "POST", url: "/accounts/sign-in", payload: { email, password: "wrong-password" } });
      expect(res.statusCode).toBe(401);
    }
    const paused = await asDevice()({ method: "POST", url: "/accounts/sign-in", payload: { email, password: "wrong-password" } });
    expect(paused.statusCode).toBe(429);
    expect(Number(paused.headers["retry-after"])).toBeGreaterThan(0);
    expect(paused.json().error).toMatch(/^Too many sign-in attempts\. Try again in \d+ minutes\.$/);

    // Another email is unaffected.
    const other = await asDevice()({ method: "POST", url: "/accounts/sign-in", payload: { email: `x-${email}`, password: "wrong-password" } });
    expect(other.statusCode).toBe(401);
  });

  it("pause a device trying many emails", async () => {
    const as = asDevice();
    for (let i = 0; i < LIMITS.signInPerDevice[0].max; i++) {
      await as({ method: "POST", url: "/accounts/sign-in", payload: { email: `e${i}-${randomUUID()}@example.com`, password: "wrong-password" } });
    }
    const paused = await as({ method: "POST", url: "/accounts/sign-in", payload: { email: `last-${randomUUID()}@example.com`, password: "x" } });
    expect(paused.statusCode).toBe(429);
  });
});

describe("sign-ups (#152)", () => {
  it("pause a device making account after account", async () => {
    const as = asDevice();
    for (let i = 0; i < LIMITS.signUpPerDevice[0].max; i++) {
      const res = await as({ method: "POST", url: "/accounts", payload: { email: `s${i}-${randomUUID()}@example.com`, password: "long-enough-pw" } });
      expect(res.statusCode).toBe(202);
    }
    const paused = await as({ method: "POST", url: "/accounts", payload: { email: `s-${randomUUID()}@example.com`, password: "long-enough-pw" } });
    expect(paused.statusCode).toBe(429);
  });
});

describe("searches (#152)", () => {
  const product: Product = { productId: "p1", name: "Milk 2L", imageUrl: "", zone: "none", regularPrice: 29.99, loyaltyPrice: null };

  it("past the limit still answer what's already known, and refuse only new fetches", async () => {
    const as = asDevice();
    const known = `milk-${randomUUID()}`;
    vi.mocked(searchProducts).mockResolvedValue([product]);
    await as({ method: "GET", url: `/search?store=makro&q=${known}` });

    for (let i = 1; i < LIMITS.searchPerDevice[0].max; i++) {
      await as({ method: "GET", url: `/search?store=makro&q=other-${i}-${randomUUID()}` });
    }
    const calls = vi.mocked(searchProducts).mock.calls.length;

    const cached = await as({ method: "GET", url: `/search?store=makro&q=${known}` });
    expect(cached.statusCode).toBe(200);
    expect(cached.json().products).toHaveLength(1);

    const fresh = await as({ method: "GET", url: `/search?store=makro&q=new-${randomUUID()}` });
    expect(fresh.statusCode).toBe(429);
    expect(fresh.json().error).toBe("Too many searches. Try again in a minute.");
    // Neither reached the store.
    expect(vi.mocked(searchProducts).mock.calls.length).toBe(calls);
  });

  it("another device is unaffected", async () => {
    const busy = asDevice();
    for (let i = 0; i <= LIMITS.searchPerDevice[0].max; i++) await busy({ method: "GET", url: `/search?store=makro&q=q${i}-${randomUUID()}` });
    expect((await asDevice()({ method: "GET", url: `/search?store=makro&q=fresh-${randomUUID()}` })).statusCode).toBe(200);
  });
});

describe("location lookups (#152)", () => {
  it("pause a device after too many new lookups", async () => {
    const as = asDevice();
    vi.mocked(nearestBranch).mockResolvedValue({ name: "Checkers FX Sandhurst", contexts: [] });
    const here = { latitude: -26.1076, longitude: 28.0567 };
    const list = (await as({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "L" } })).json();
    for (let i = 0; i < LIMITS.locatePerDevice[0].max; i++) {
      expect((await as({ method: "PUT", url: `/lists/${list.id}/location`, payload: here })).statusCode).toBe(200);
    }
    const paused = await as({ method: "PUT", url: `/lists/${list.id}/location`, payload: here });
    expect(paused.statusCode).toBe(429);
    expect(paused.json().error).toMatch(/^Too many location lookups/);
  });
});

describe("comparisons (#152)", () => {
  it("pause an account after too many, before any store is asked", async () => {
    const signedUp = await signUp((o) => app.inject(o), { email: `k-${randomUUID()}@example.com`, password: "long-enough-pw" });
    const cookies = Object.fromEntries(signedUp.cookies.map((c) => [c.name, c.value]));
    // A list that isn't there: each try is counted, then answered 404.
    const compare = () => app.inject({ method: "POST", url: `/lists/${randomUUID()}/compare`, payload: { targetStore: "makro" }, cookies });
    for (let i = 0; i < LIMITS.comparePerAccount[0].max; i++) expect((await compare()).statusCode).toBe(404);
    const paused = await compare();
    expect(paused.statusCode).toBe(429);
    expect(paused.json().error).toMatch(/^Too many comparisons/);
  });
});

describe("cookies (#153)", () => {
  it("are HTTPS-only in production", async () => {
    const email = `c-${randomUUID()}@example.com`;
    await signUp((o) => app.inject(o), { email, password: "long-enough-pw" });
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      // A fresh device signing in gets both cookies: its id and the session.
      const res = await app.inject({ method: "POST", url: "/accounts/sign-in", payload: { email, password: "long-enough-pw" } });
      const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
      expect(cookies.length).toBeGreaterThanOrEqual(2);
      for (const c of cookies) expect(c).toMatch(/;\s*Secure/i);
    } finally {
      process.env.NODE_ENV = before;
    }
  });

  it("still work over plain HTTP in development", async () => {
    const res = await app.inject({ method: "GET", url: "/lists" });
    for (const c of ([] as string[]).concat(res.headers["set-cookie"] ?? [])) expect(c).not.toMatch(/;\s*Secure/i);
  });
});
