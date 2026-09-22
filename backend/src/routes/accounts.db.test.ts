import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

function cookieValue(res: { cookies: { name: string; value: string }[] }, name: string) {
  return res.cookies.find((c) => c.name === name)?.value;
}

const credentials = { email: "shopper@example.com", password: "correct horse battery staple" };

describe("POST /accounts — sign up", () => {
  it("creates an Account and signs the Shopper in", async () => {
    const res = await app.inject({ method: "POST", url: "/accounts", payload: credentials });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), email: credentials.email });
    expect(cookieValue(res, "accucery_session")).toBeDefined();
  });

  it("never returns a password or password hash in the response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/accounts",
      payload: { email: "no-leak@example.com", password: "correct horse battery staple" },
    });
    const body = res.json();
    expect(body.password).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
  });

  it("refuses a duplicate email without confirming it belongs to someone", async () => {
    const email = "dupe@example.com";
    await app.inject({ method: "POST", url: "/accounts", payload: { email, password: "first password here" } });

    const second = await app.inject({
      method: "POST",
      url: "/accounts",
      payload: { email, password: "a different password" },
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects a malformed email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/accounts",
      payload: { email: "not-an-email", password: "correct horse battery staple" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a password that is too short", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/accounts",
      payload: { email: "short@example.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /accounts/sign-in", () => {
  it("signs in with the correct email and password", async () => {
    const email = "sign-in-happy@example.com";
    await app.inject({ method: "POST", url: "/accounts", payload: { email, password: "correct horse battery staple" } });

    const res = await app.inject({
      method: "POST",
      url: "/accounts/sign-in",
      payload: { email, password: "correct horse battery staple" },
    });
    expect(res.statusCode).toBe(200);
    expect(cookieValue(res, "accucery_session")).toBeDefined();
  });

  // Both failure modes must look identical from the outside — otherwise a
  // prober can tell which emails have accounts by which message comes back.
  it("gives the same generic failure for an unknown email as for a wrong password", async () => {
    const email = "sign-in-wrong@example.com";
    await app.inject({ method: "POST", url: "/accounts", payload: { email, password: "correct horse battery staple" } });

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/accounts/sign-in",
      payload: { email, password: "definitely not it" },
    });
    const unknownEmail = await app.inject({
      method: "POST",
      url: "/accounts/sign-in",
      payload: { email: "never-signed-up@example.com", password: "definitely not it" },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });
});

describe("GET /accounts/session and sign-out", () => {
  it("reflects who is signed in, and nobody before signing up", async () => {
    const before = await app.inject({ method: "GET", url: "/accounts/session" });
    expect(before.json()).toEqual({ account: null });

    const email = "session-check@example.com";
    const signUp = await app.inject({
      method: "POST",
      url: "/accounts",
      payload: { email, password: "correct horse battery staple" },
    });
    const sessionId = cookieValue(signUp, "accucery_session")!;

    const signedIn = await app.inject({
      method: "GET",
      url: "/accounts/session",
      cookies: { accucery_session: sessionId },
    });
    expect(signedIn.json()).toEqual({ account: { id: signUp.json().id, email } });
  });

  it("signing out clears the session, so the same cookie no longer signs anyone in", async () => {
    const email = "sign-out@example.com";
    const signUp = await app.inject({
      method: "POST",
      url: "/accounts",
      payload: { email, password: "correct horse battery staple" },
    });
    const sessionId = cookieValue(signUp, "accucery_session")!;

    await app.inject({
      method: "POST",
      url: "/accounts/sign-out",
      cookies: { accucery_session: sessionId },
    });

    const after = await app.inject({
      method: "GET",
      url: "/accounts/session",
      cookies: { accucery_session: sessionId },
    });
    expect(after.json()).toEqual({ account: null });
  });

  it("signing out with no session at all is not an error", async () => {
    const res = await app.inject({ method: "POST", url: "/accounts/sign-out" });
    expect(res.statusCode).toBe(204);
  });
});
