import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import type { FastifyInstance, InjectOptions } from "fastify";

vi.mock("../scraper/engine.js", () => ({
  searchProducts: vi.fn(),
  currentZone: vi.fn(),
}));

import { searchProducts, currentZone } from "../scraper/engine.js";

const mockSearch = vi.mocked(searchProducts);
const mockZone = vi.mocked(currentZone);

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
  mockZone.mockResolvedValue("none");
});

function cookieValue(res: { cookies: { name: string; value: string }[] }, name: string) {
  return res.cookies.find((c) => c.name === name)?.value;
}

// Every request in a test speaks as one device, optionally also signed in —
// mirrors accounts.db.test.ts's own fixtures.
function asDevice(deviceId: string) {
  return (opts: InjectOptions) =>
    app.inject({ ...opts, cookies: { ...(opts.cookies as Record<string, string> | undefined), [DEVICE_ID_COOKIE]: deviceId } });
}

function withSession(base: InjectOptions, sessionId: string): InjectOptions {
  return { ...base, cookies: { ...(base.cookies as Record<string, string> | undefined), accucery_session: sessionId } };
}

async function signedInDevice(email: string) {
  const deviceId = randomUUID();
  const device = asDevice(deviceId);
  const signUp = await device({ method: "POST", url: "/accounts", payload: { email, password: "correct horse battery staple" } });
  const session = cookieValue(signUp, "accucery_session")!;
  return { device, session };
}

const milk = {
  productId: "milk-1",
  productName: "Milk 2 L",
  imageUrl: "https://example.com/milk.jpg",
  regularPrice: 30,
  loyaltyPrice: null,
  quantity: 1,
};

describe("POST /lists/:id/compare", () => {
  it("prompts sign-in rather than silently blocking or allowing a signed-out Shopper", async () => {
    const deviceId = randomUUID();
    const device = asDevice(deviceId);
    const list = await device({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } });

    const res = await device({
      method: "POST",
      url: `/lists/${list.json().id}/compare`,
      payload: { targetStore: "shoprite" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for a list belonging to a different Shopper", async () => {
    const { device, session } = await signedInDevice("owner@example.com");
    const list = await device(withSession({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } }, session));

    const { device: impostor, session: impostorSession } = await signedInDevice("impostor@example.com");
    const res = await impostor(
      withSession({ method: "POST", url: `/lists/${list.json().id}/compare`, payload: { targetStore: "shoprite" } }, impostorSession)
    );
    expect(res.statusCode).toBe(404);
  });

  it("refuses to compare a list against its own store", async () => {
    const { device, session } = await signedInDevice("same-store@example.com");
    const list = await device(withSession({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } }, session));

    const res = await device(
      withSession({ method: "POST", url: `/lists/${list.json().id}/compare`, payload: { targetStore: "checkers" } }, session)
    );
    expect(res.statusCode).toBe(400);
  });

  it("refuses a target store Accucery does not know or that is not active", async () => {
    const { device, session } = await signedInDevice("bad-store@example.com");
    const list = await device(withSession({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } }, session));

    const res = await device(
      withSession({ method: "POST", url: `/lists/${list.json().id}/compare`, payload: { targetStore: "not-a-store" } }, session)
    );
    expect(res.statusCode).toBe(400);
  });

  it("prices a matched item at the target store and reports the list as complete", async () => {
    const { device, session } = await signedInDevice("happy-path@example.com");
    const list = await device(withSession({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } }, session));
    await device(withSession({ method: "POST", url: `/lists/${list.json().id}/items`, payload: { ...milk, zone: "none" } }, session));

    mockSearch.mockResolvedValue([
      { productId: "sr-milk", name: "Full Cream Milk 2 L", imageUrl: "", zone: "none", regularPrice: 27, loyaltyPrice: null },
    ]);

    const res = await device(
      withSession({ method: "POST", url: `/lists/${list.json().id}/compare`, payload: { targetStore: "shoprite" } }, session)
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.storeSlug).toBe("shoprite");
    expect(body.complete).toBe(true);
    expect(body.unmatchedCount).toBe(0);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].matched).toBe(true);
    expect(body.items[0].substitute.productId).toBe("sr-milk");
    expect(body.total).toBeCloseTo(27);
  });

  it("keeps an unmatched item visible and marks the comparison incomplete rather than dropping it", async () => {
    const { device, session } = await signedInDevice("incomplete@example.com");
    const list = await device(withSession({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } }, session));
    await device(withSession({ method: "POST", url: `/lists/${list.json().id}/items`, payload: { ...milk, zone: "none" } }, session));

    mockSearch.mockResolvedValue([]); // nothing at the target store

    const res = await device(
      withSession({ method: "POST", url: `/lists/${list.json().id}/compare`, payload: { targetStore: "shoprite" } }, session)
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.complete).toBe(false);
    expect(body.unmatchedCount).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].matched).toBe(false);
    expect(body.total).toBe(0);
  });

  // #90's own acceptance criterion: a comparison must not assume every
  // store is metered. Makro/Woolworths cost nothing, and this path is
  // identical for them — the mocked scraper proves the route itself does
  // not special-case cost.
  it("works the same way against a store with zero ScraperAPI cost", async () => {
    const { device, session } = await signedInDevice("free-store@example.com");
    const list = await device(withSession({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } }, session));
    await device(withSession({ method: "POST", url: `/lists/${list.json().id}/items`, payload: { ...milk, zone: "none" } }, session));

    mockSearch.mockResolvedValue([
      { productId: "makro-milk", name: "Long Life Milk 2 L", imageUrl: "", zone: "none", regularPrice: 24, loyaltyPrice: null },
    ]);

    const res = await device(
      withSession({ method: "POST", url: `/lists/${list.json().id}/compare`, payload: { targetStore: "makro" } }, session)
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().complete).toBe(true);
    expect(res.json().total).toBeCloseTo(24);
  });
});
