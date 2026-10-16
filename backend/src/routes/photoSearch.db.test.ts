import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import { LIMITS } from "../rateLimit.js";
import { setPhotoReader, MAX_IMAGE_CHARS } from "./photoSearch.js";
import type { PhotoReader } from "../photoSearch/reader.js";

// Photo search (2026-10-16), with a stand-in for Claude.

let app: FastifyInstance;
const logged: string[] = [];
const PHOTO = Buffer.from("a small photo").toString("base64");

beforeAll(async () => {
  app = await buildApp({ logStream: { write: (line) => logged.push(line) } });
  await app.ready();
});

afterAll(async () => {
  setPhotoReader(undefined);
  await app.close();
  await testPrisma.$disconnect();
});

afterEach(() => setPhotoReader(undefined));

function browser() {
  const cookies: Record<string, string> = { [DEVICE_ID_COOKIE]: randomUUID() };
  return {
    async send(opts: InjectOptions) {
      const res = await app.inject({ ...opts, cookies });
      for (const c of res.cookies) cookies[c.name] = c.value;
      return res;
    },
  };
}
async function signedIn() {
  const b = browser();
  expect((await signUp(b.send, { email: `photo-${randomUUID()}@example.com`, password: "correct horse battery staple" })).statusCode).toBe(201);
  return b;
}
const photoSearch = (b: ReturnType<typeof browser>, body: object = {}) =>
  b.send({ method: "POST", url: "/search/photo", payload: { store: "checkers", image: PHOTO, mediaType: "image/jpeg", ...body } });

describe("photo search", () => {
  it("says whether it's available: only once Claude is set up", async () => {
    setPhotoReader(null);
    expect((await app.inject({ method: "GET", url: "/search/photo" })).json()).toEqual({ available: false });
    setPhotoReader(async () => []);
    expect((await app.inject({ method: "GET", url: "/search/photo" })).json()).toEqual({ available: true });
  });

  it("reads the photo for a signed-in shopper, with the store's name", async () => {
    const asked: Parameters<PhotoReader>[0][] = [];
    setPhotoReader(async (photo) => {
      asked.push(photo);
      return ["Clover full cream milk 2L", "White bread 700g"];
    });
    const res = await photoSearch(await signedIn());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queries: ["Clover full cream milk 2L", "White bread 700g"] });
    expect(asked).toEqual([{ image: PHOTO, mediaType: "image/jpeg", storeName: "Checkers" }]);
  });

  it("is for signed-in shoppers only, and never asks Claude otherwise", async () => {
    let asked = 0;
    setPhotoReader(async () => (asked++, []));
    const res = await photoSearch(browser());
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Sign in to search with a photo");
    expect(asked).toBe(0);
  });

  it("refuses a bad store, file type or picture before asking Claude", async () => {
    let asked = 0;
    setPhotoReader(async () => (asked++, []));
    const b = await signedIn();
    expect((await photoSearch(b, { store: "nowhere" })).statusCode).toBe(400);
    expect((await photoSearch(b, { mediaType: "image/gif" })).statusCode).toBe(400);
    expect((await photoSearch(b, { image: "not base64!" })).statusCode).toBe(400);
    expect((await photoSearch(b, { image: "" })).statusCode).toBe(400);
    expect((await photoSearch(b, { image: "A".repeat(MAX_IMAGE_CHARS + 4) })).statusCode).toBeGreaterThanOrEqual(400);
    expect(asked).toBe(0);
  });

  it("says when it isn't set up", async () => {
    setPhotoReader(null);
    const res = await photoSearch(await signedIn());
    expect(res.statusCode).toBe(503);
  });

  it("limits each account, before asking Claude", async () => {
    let asked = 0;
    setPhotoReader(async () => (asked++, ["Milk"]));
    const b = await signedIn();
    for (let i = 0; i < LIMITS.photoSearchesPerAccount[0].max; i++) expect((await photoSearch(b)).statusCode).toBe(200);
    const paused = await photoSearch(b);
    expect(paused.statusCode).toBe(429);
    expect(paused.json().error).toMatch(/^Too many photo searches/);
    expect(asked).toBe(LIMITS.photoSearchesPerAccount[0].max);
    // Another shopper is unaffected.
    expect((await photoSearch(await signedIn())).statusCode).toBe(200);
  });

  it("answers plainly when Claude can't be reached, and never logs the photo", async () => {
    const secret = Buffer.from("a photo nobody may log " + randomUUID()).toString("base64");
    setPhotoReader(async () => {
      throw new Error("529 overloaded");
    });
    const res = await photoSearch(await signedIn(), { image: secret });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/Try again/);
    const all = logged.join("\n");
    expect(all).toContain("photo search failed");
    expect(all).toContain("529 overloaded");
    expect(all).not.toContain(secret);
  });
});
