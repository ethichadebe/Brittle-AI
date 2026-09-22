import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { DEVICE_ID_COOKIE, isValidDeviceId, registerDeviceId } from "./deviceId.js";

// Pure — no Prisma, no database. The hook only ever touches the cookie jar,
// so a bare Fastify instance with a dummy route is enough to prove it without
// paying for `buildApp()` and everything it wires up.
let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await registerDeviceId(app);
  app.get("/whoami", async (req) => ({ deviceId: req.deviceId }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function setCookieValue(res: { cookies: { name: string; value: string }[] }): string | undefined {
  return res.cookies.find((c) => c.name === DEVICE_ID_COOKIE)?.value;
}

describe("isValidDeviceId", () => {
  it("accepts a v4 UUID", () => {
    expect(isValidDeviceId("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(true);
  });

  it("refuses a non-UUID string", () => {
    expect(isValidDeviceId("not-a-uuid")).toBe(false);
    expect(isValidDeviceId("")).toBe(false);
    expect(isValidDeviceId(undefined)).toBe(false);
  });
});

describe("device identity", () => {
  it("issues a new identity when no cookie is sent", async () => {
    const res = await app.inject({ method: "GET", url: "/whoami" });
    const issued = setCookieValue(res);
    expect(isValidDeviceId(issued)).toBe(true);
    expect(res.json().deviceId).toBe(issued);
  });

  // The point of the whole feature: the identity has to survive a second
  // request, or every page load is a different, empty shopper.
  it("reuses a valid cookie instead of issuing a new one", async () => {
    const first = await app.inject({ method: "GET", url: "/whoami" });
    const deviceId = setCookieValue(first);

    const second = await app.inject({
      method: "GET",
      url: "/whoami",
      cookies: { [DEVICE_ID_COOKIE]: deviceId! },
    });

    expect(second.json().deviceId).toBe(deviceId);
    // No Set-Cookie on the second request — nothing was reissued.
    expect(setCookieValue(second)).toBeUndefined();
  });

  // A client cannot hand us an arbitrary string and have it accepted as a
  // real identity — that would let one browser claim to be any device it
  // liked, including one with lists already on it.
  it("does not accept a malformed cookie as someone's identity", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      cookies: { [DEVICE_ID_COOKIE]: "attacker-supplied-value" },
    });

    expect(res.json().deviceId).not.toBe("attacker-supplied-value");
    expect(isValidDeviceId(res.json().deviceId)).toBe(true);
    // A fresh, valid identity was issued in its place.
    expect(isValidDeviceId(setCookieValue(res))).toBe(true);
  });

  it("two requests with no cookie at all get two different identities", async () => {
    const a = await app.inject({ method: "GET", url: "/whoami" });
    const b = await app.inject({ method: "GET", url: "/whoami" });
    expect(setCookieValue(a)).not.toBe(setCookieValue(b));
  });
});
