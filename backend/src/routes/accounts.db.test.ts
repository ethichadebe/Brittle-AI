import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp, tokenFor } from "../test/signUp.js";
import { devOutbox } from "../mail/mailer.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";
import type { FastifyInstance, InjectOptions } from "fastify";

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

// #148: sign-up emails a link; the Account exists only once it's opened.
describe("POST /accounts — sign up", () => {
  const send = (o: InjectOptions) => app.inject(o);

  it("emails a confirm link, and creates no account and no session yet", async () => {
    const res = await app.inject({ method: "POST", url: "/accounts", payload: credentials });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ pending: true, email: credentials.email });
    expect(cookieValue(res, "accucery_session")).toBeUndefined();
    expect(await testPrisma.account.findUnique({ where: { email: credentials.email } })).toBeNull();
    expect(tokenFor(credentials.email, "/confirm-email")).toBeDefined();
    const mail = devOutbox[devOutbox.length - 1];
    expect(mail.subject).toBe("Confirm your email for Accucery");
    expect(mail.html).toContain("Confirm my email");
  });

  it("keeps only a hash of the link, never the link itself or the password", async () => {
    await app.inject({ method: "POST", url: "/accounts", payload: credentials });
    const token = tokenFor(credentials.email, "/confirm-email")!;
    const stored = JSON.stringify(await testPrisma.pendingSignup.findMany());
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(credentials.password);
  });

  it("opening the link creates the account and signs this device in", async () => {
    const res = await signUp(send, credentials);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), email: credentials.email, collisions: [] });
    expect(res.json().passwordHash).toBeUndefined();
    expect(cookieValue(res, "accucery_session")).toBeDefined();
    // The password chosen at sign-up is the one that works.
    const signIn = await app.inject({ method: "POST", url: "/accounts/sign-in", payload: credentials });
    expect(signIn.statusCode).toBe(200);
  });

  it("a link works once", async () => {
    await app.inject({ method: "POST", url: "/accounts", payload: credentials });
    const token = tokenFor(credentials.email, "/confirm-email")!;
    expect((await app.inject({ method: "POST", url: "/accounts/confirm", payload: { token } })).statusCode).toBe(201);

    const again = await app.inject({ method: "POST", url: "/accounts/confirm", payload: { token } });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ error: "This link has expired or has already been used.", code: "link-invalid" });
  });

  it("an expired link is refused, and creates nothing", async () => {
    await app.inject({ method: "POST", url: "/accounts", payload: credentials });
    const token = tokenFor(credentials.email, "/confirm-email")!;
    await testPrisma.pendingSignup.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await app.inject({ method: "POST", url: "/accounts/confirm", payload: { token } });
    expect(res.json().code).toBe("link-invalid");
    expect(await testPrisma.account.count()).toBe(0);
  });

  it("a made-up link is refused the same way", async () => {
    for (const token of ["", "not-a-real-token", "A".repeat(43)]) {
      const res = await app.inject({ method: "POST", url: "/accounts/confirm", payload: { token } });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("link-invalid");
    }
  });

  it("signing up again sends a new link, and only the newest works", async () => {
    await app.inject({ method: "POST", url: "/accounts", payload: credentials });
    const first = tokenFor(credentials.email, "/confirm-email")!;
    await app.inject({ method: "POST", url: "/accounts", payload: credentials });
    const second = tokenFor(credentials.email, "/confirm-email")!;
    expect(second).not.toBe(first);

    expect((await app.inject({ method: "POST", url: "/accounts/confirm", payload: { token: first } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/accounts/confirm", payload: { token: second } })).statusCode).toBe(201);
  });

  // Telling these apart would say which emails have accounts.
  it("answers the same for an email that already has an account, and emails its owner instead", async () => {
    await signUp(send, credentials);
    const before = await testPrisma.account.findUniqueOrThrow({ where: { email: credentials.email } });

    const res = await app.inject({ method: "POST", url: "/accounts", payload: { ...credentials, password: "someone elses password" } });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ pending: true, email: credentials.email });
    const mail = devOutbox[devOutbox.length - 1];
    expect(mail.to).toBe(credentials.email);
    expect(mail.subject).toBe("You already have an Accucery account");
    expect(mail.text).toContain("/forgot-password");
    expect(tokenFor(credentials.email, "/confirm-email")).toBeUndefined();
    expect(await testPrisma.pendingSignup.count()).toBe(0);
    // Nothing about the existing account changed.
    expect(await testPrisma.account.findUniqueOrThrow({ where: { email: credentials.email } })).toEqual(before);
  });

  it("doesn't flood one address with emails", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ method: "POST", url: "/accounts", payload: credentials })).statusCode).toBe(202);
    }
    const res = await app.inject({ method: "POST", url: "/accounts", payload: credentials });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatch(/^Too many emails to this address/);
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

// #149: a forgotten password, reset by an emailed link.
describe("resetting a forgotten password", () => {
  const send = (o: InjectOptions) => app.inject(o);
  const ask = (email: string) => app.inject({ method: "POST", url: "/accounts/password-reset", payload: { email } });
  const complete = (token: string, password: string, cookies?: Record<string, string>) =>
    app.inject({ method: "POST", url: "/accounts/password-reset/complete", payload: { token, password }, ...(cookies && { cookies }) });

  it("answers the same whether or not the email has an account", async () => {
    await signUp(send, credentials);
    const known = await ask(credentials.email);
    const unknown = await ask("nobody-here@example.com");

    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    expect(tokenFor(credentials.email, "/reset-password")).toBeDefined();
    expect(devOutbox.some((m) => m.to === "nobody-here@example.com")).toBe(false);
  });

  it("the new password works, the old one doesn't, and every session is signed out", async () => {
    const first = await signUp(send, credentials);
    const oldSession = cookieValue(first, "accucery_session")!;
    const other = await app.inject({ method: "POST", url: "/accounts/sign-in", payload: credentials });
    const otherSession = cookieValue(other, "accucery_session")!;

    await ask(credentials.email);
    const res = await complete(tokenFor(credentials.email, "/reset-password")!, "a brand new password");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email: credentials.email });

    for (const session of [oldSession, otherSession]) {
      const who = await app.inject({ method: "GET", url: "/accounts/session", cookies: { accucery_session: session } });
      expect(who.json()).toEqual({ account: null });
    }
    expect((await app.inject({ method: "POST", url: "/accounts/sign-in", payload: credentials })).statusCode).toBe(401);
    const signIn = await app.inject({ method: "POST", url: "/accounts/sign-in", payload: { ...credentials, password: "a brand new password" } });
    expect(signIn.statusCode).toBe(200);
  });

  it("a link works once, expires, and can't be made up", async () => {
    await signUp(send, credentials);
    await ask(credentials.email);
    const token = tokenFor(credentials.email, "/reset-password")!;
    expect((await complete(token, "a brand new password")).statusCode).toBe(200);
    expect((await complete(token, "another new password")).json().code).toBe("link-invalid");

    await ask(credentials.email);
    const late = tokenFor(credentials.email, "/reset-password")!;
    await testPrisma.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await complete(late, "a brand new password")).json().code).toBe("link-invalid");

    expect((await complete("made-up", "a brand new password")).json().code).toBe("link-invalid");
    // None of those changed the password from the first reset.
    expect((await app.inject({ method: "POST", url: "/accounts/sign-in", payload: { ...credentials, password: "a brand new password" } })).statusCode).toBe(200);
  });

  it("refuses a short new password, and keeps the link usable", async () => {
    await signUp(send, credentials);
    await ask(credentials.email);
    const token = tokenFor(credentials.email, "/reset-password")!;
    expect((await complete(token, "short")).statusCode).toBe(400);
    expect((await complete(token, "long enough now")).statusCode).toBe(200);
  });

  it("is limited per email and per device", async () => {
    // Sign-up and reset share one allowance per address: the confirm email
    // was the first of three.
    await signUp(send, credentials);
    for (let i = 0; i < 2; i++) expect((await ask(credentials.email)).statusCode).toBe(202);
    const paused = await ask(credentials.email);
    expect(paused.statusCode).toBe(429);
    expect(paused.json().error).toMatch(/^Too many reset emails/);

    const device = { [DEVICE_ID_COOKIE]: randomUUID() };
    let last = 0;
    for (let i = 0; i <= 10; i++) {
      last = (await app.inject({ method: "POST", url: "/accounts/password-reset", payload: { email: `r${i}@example.com` }, cookies: device })).statusCode;
    }
    expect(last).toBe(429);
  });

  it("the link is kept only as a hash", async () => {
    await signUp(send, credentials);
    await ask(credentials.email);
    const token = tokenFor(credentials.email, "/reset-password")!;
    expect(JSON.stringify(await testPrisma.passwordReset.findMany())).not.toContain(token);
  });
});

describe("POST /accounts/sign-in", () => {
  it("signs in with the correct email and password", async () => {
    const email = "sign-in-happy@example.com";
    await signUp((o) => app.inject(o), { email, password: "correct horse battery staple" });

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
    await signUp((o) => app.inject(o), { email, password: "correct horse battery staple" });

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
    const signedUp = await signUp((o) => app.inject(o), { email, password: "correct horse battery staple" });
    const sessionId = cookieValue(signedUp, "accucery_session")!;

    const signedIn = await app.inject({
      method: "GET",
      url: "/accounts/session",
      cookies: { accucery_session: sessionId },
    });
    expect(signedIn.json()).toEqual({ account: { id: signedUp.json().id, email } });
  });

  it("signing out clears the session, so the same cookie no longer signs anyone in", async () => {
    const email = "sign-out@example.com";
    const signedUp = await signUp((o) => app.inject(o), { email, password: "correct horse battery staple" });
    const sessionId = cookieValue(signedUp, "accucery_session")!;

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

// #85: signing in claims the device's anonymous lists. Every test here
// pins its own device id rather than letting the server issue one, so a
// list made "anonymously" and a later sign-in can be proven to be the same
// device throughout.
describe("claiming anonymous lists at sign-in", () => {
  function asDevice(deviceId: string) {
    return (opts: InjectOptions) =>
      app.inject({
        ...opts,
        cookies: { ...(opts.cookies as Record<string, string> | undefined), [DEVICE_ID_COOKIE]: deviceId },
      });
  }

  function withSession(base: InjectOptions, sessionId: string): InjectOptions {
    return {
      ...base,
      cookies: { ...(base.cookies as Record<string, string> | undefined), accucery_session: sessionId },
    };
  }

  it("moves an anonymous list onto a brand-new Account at sign-up", async () => {
    const deviceId = randomUUID();
    const anon = asDevice(deviceId);

    await anon({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } });

    const signedUp = await signUp(anon, { email: "claims-at-signup@example.com", password: "correct horse battery staple" });
    const sessionId = cookieValue(signedUp, "accucery_session")!;

    const signedInView = await anon(withSession({ method: "GET", url: "/lists" }, sessionId));
    expect(signedInView.json().lists.map((l: { name: string }) => l.name)).toContain("Monthly");

    // Per the acceptance criteria: the device has nothing left to lose —
    // asking anonymously (no session cookie at all) now finds nothing.
    const anonymousView = await anon({ method: "GET", url: "/lists" });
    expect(anonymousView.json().lists).toHaveLength(0);
  });

  it("moves an anonymous list onto an existing Account at sign-in", async () => {
    const email = "claims-at-signin@example.com";
    const password = "correct horse battery staple";

    // The account is created on one device, with nothing to claim.
    await signUp(asDevice(randomUUID()), { email, password });

    // A second, later session on a different device builds a list before
    // ever signing in.
    const deviceId = randomUUID();
    const anon = asDevice(deviceId);
    await anon({ method: "POST", url: "/lists", payload: { storeSlug: "woolworths", name: "Braai" } });

    const signIn = await anon({ method: "POST", url: "/accounts/sign-in", payload: { email, password } });
    const sessionId = cookieValue(signIn, "accucery_session")!;

    const signedInView = await anon(withSession({ method: "GET", url: "/lists" }, sessionId));
    expect(signedInView.json().lists.map((l: { name: string }) => l.name)).toContain("Braai");
  });

  it("signing in with no anonymous lists on the device is a no-op", async () => {
    const email = "nothing-to-claim@example.com";
    const password = "correct horse battery staple";
    await signUp(asDevice(randomUUID()), { email, password });

    // A fresh device, never used to build a list, signs in.
    const freshDevice = asDevice(randomUUID());
    const signIn = await freshDevice({ method: "POST", url: "/accounts/sign-in", payload: { email, password } });
    expect(signIn.statusCode).toBe(200);

    const sessionId = cookieValue(signIn, "accucery_session")!;
    const view = await freshDevice(withSession({ method: "GET", url: "/lists" }, sessionId));
    expect(view.json().lists).toHaveLength(0);
  });

  // The one case #85 deliberately does not resolve — see ADR 0003 and #86.
  // Combining would sum quantities irreversibly, so a same-name-same-store
  // collision is left exactly where it is rather than guessed at here.
  it("leaves a colliding list untouched — not merged, not duplicated", async () => {
    const email = "collision@example.com";
    const password = "correct horse battery staple";

    const deviceId = randomUUID();
    const device = asDevice(deviceId);

    // Sign up, then sign in immediately (simpler than juggling the sign-up
    // cookie) and create "Monthly"/checkers while genuinely signed in, so it
    // is owned by the Account from the start.
    const signedUp = await signUp(device, { email, password });
    const firstSession = cookieValue(signedUp, "accucery_session")!;
    await device(
      withSession(
        { method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } },
        firstSession
      )
    );

    // Sign out — same device, now anonymous again — and build a second,
    // unrelated "Monthly"/checkers list before signing back in.
    await device(withSession({ method: "POST", url: "/accounts/sign-out" }, firstSession));
    await device({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } });

    const signIn = await device({ method: "POST", url: "/accounts/sign-in", payload: { email, password } });
    const secondSession = cookieValue(signIn, "accucery_session")!;

    // The sign-in response names the collision, per #86 — this is what the
    // frontend prompt is built from.
    expect(signIn.json().collisions).toEqual([
      { anonymousListId: expect.any(String), name: "Monthly", storeSlug: "checkers" },
    ]);

    const view = await device(withSession({ method: "GET", url: "/lists" }, secondSession));
    const monthlies = view.json().lists.filter((l: { name: string }) => l.name === "Monthly");
    // Still one list on the Account, not two and not a merged one — the
    // colliding anonymous list was left where it was, per #86.
    expect(monthlies).toHaveLength(1);

    const stillAnonymous = await testPrisma.list.findFirst({
      where: { userId: deviceId, name: "Monthly", storeSlug: "checkers" },
    });
    expect(stillAnonymous).not.toBeNull();
  });
});

// #86: resolving what #85 left alone. Every test builds its own collision
// from scratch, the same way the test above does — sign up, make a list
// while signed in, sign out, make a colliding one anonymously, sign back in.
describe("resolving a list collision", () => {
  function asDevice(deviceId: string) {
    return (opts: InjectOptions) =>
      app.inject({
        ...opts,
        cookies: { ...(opts.cookies as Record<string, string> | undefined), [DEVICE_ID_COOKIE]: deviceId },
      });
  }

  function withSession(base: InjectOptions, sessionId: string): InjectOptions {
    return {
      ...base,
      cookies: { ...(base.cookies as Record<string, string> | undefined), accucery_session: sessionId },
    };
  }

  const beans = {
    productId: "beans-1",
    productName: "Baked Beans 400g",
    imageUrl: "https://example.com/beans.jpg",
    regularPrice: 17.99,
    loyaltyPrice: null,
    quantity: 1,
  };

  async function buildCollision(email: string) {
    const deviceId = randomUUID();
    const device = asDevice(deviceId);

    const signedUp = await signUp(device, { email, password: "correct horse battery staple" });
    const firstSession = cookieValue(signedUp, "accucery_session")!;
    const accountList = await device(
      withSession({ method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } }, firstSession)
    );
    await device(
      withSession(
        { method: "POST", url: `/lists/${accountList.json().id}/items`, payload: beans },
        firstSession
      )
    );

    await device(withSession({ method: "POST", url: "/accounts/sign-out" }, firstSession));
    const anonymousList = await device({
      method: "POST",
      url: "/lists",
      payload: { storeSlug: "checkers", name: "Monthly" },
    });
    await device({
      method: "POST",
      url: `/lists/${anonymousList.json().id}/items`,
      payload: { ...beans, quantity: 2 },
    });

    const signIn = await device({ method: "POST", url: "/accounts/sign-in", payload: { email, password: "correct horse battery staple" } });
    const session = cookieValue(signIn, "accucery_session")!;
    const anonymousListId = signIn.json().collisions[0].anonymousListId;

    return { device, session, accountListId: accountList.json().id, anonymousListId };
  }

  it("combining sums quantities into the existing Account list and discards the anonymous one", async () => {
    const { device, session, accountListId, anonymousListId } = await buildCollision("combine@example.com");

    const resolve = await device(
      withSession(
        { method: "POST", url: `/accounts/collisions/${anonymousListId}/resolve`, payload: { resolution: "combine" } },
        session
      )
    );
    expect(resolve.statusCode).toBe(204);

    const items = await device(withSession({ method: "GET", url: `/lists/${accountListId}/items` }, session));
    expect(items.json().items).toHaveLength(1);
    expect(items.json().items[0].quantity).toBe(3); // 1 (account) + 2 (anonymous)

    const gone = await testPrisma.list.findUnique({ where: { id: anonymousListId } });
    expect(gone).toBeNull();
  });

  it("keeping both claims the anonymous list under a disambiguated name", async () => {
    const { device, session, accountListId, anonymousListId } = await buildCollision("keep-both@example.com");

    const resolve = await device(
      withSession(
        { method: "POST", url: `/accounts/collisions/${anonymousListId}/resolve`, payload: { resolution: "keep-both" } },
        session
      )
    );
    expect(resolve.statusCode).toBe(204);

    const view = await device(withSession({ method: "GET", url: "/lists" }, session));
    const names = view.json().lists.map((l: { name: string }) => l.name).sort();
    expect(names).toEqual(["Monthly", "Monthly (2)"]);

    // Neither list's items were touched — nothing was merged.
    const original = await device(withSession({ method: "GET", url: `/lists/${accountListId}/items` }, session));
    expect(original.json().items).toHaveLength(1);
    expect(original.json().items[0].quantity).toBe(1);
  });

  it("requires being signed in", async () => {
    const { anonymousListId } = await buildCollision("no-session@example.com");
    const res = await app.inject({
      method: "POST",
      url: `/accounts/collisions/${anonymousListId}/resolve`,
      payload: { resolution: "combine" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("refuses to resolve a list belonging to a different device", async () => {
    const { session, anonymousListId } = await buildCollision("wrong-device@example.com");
    const impostor = asDevice(randomUUID());

    const res = await impostor(
      withSession(
        { method: "POST", url: `/accounts/collisions/${anonymousListId}/resolve`, payload: { resolution: "combine" } },
        session
      )
    );
    expect(res.statusCode).toBe(404);
  });

  it("rejects a resolution that is neither combine nor keep-both", async () => {
    const { device, session, anonymousListId } = await buildCollision("bad-resolution@example.com");
    const res = await device(
      withSession(
        { method: "POST", url: `/accounts/collisions/${anonymousListId}/resolve`, payload: { resolution: "guess" } },
        session
      )
    );
    expect(res.statusCode).toBe(400);
  });

  // The target list is looked up by name and Store alone once the anonymous
  // list's identity is confirmed — a third, unrelated Account sharing that
  // same common name ("Monthly" at checkers, easy to pick twice by
  // coincidence) must never be the one that gets merged into.
  it("never resolves into a different Account's same-named list", async () => {
    const stranger = asDevice(randomUUID());
    const strangerSignUp = await signUp(stranger, { email: "stranger@example.com", password: "correct horse battery staple" });
    const strangerSession = cookieValue(strangerSignUp, "accucery_session")!;
    const strangerList = await stranger(
      withSession(
        { method: "POST", url: "/lists", payload: { storeSlug: "checkers", name: "Monthly" } },
        strangerSession
      )
    );
    await stranger(
      withSession(
        {
          method: "POST",
          url: `/lists/${strangerList.json().id}/items`,
          payload: { ...beans, quantity: 9 },
        },
        strangerSession
      )
    );

    const { device, session, accountListId, anonymousListId } = await buildCollision("real-target@example.com");
    const resolve = await device(
      withSession(
        { method: "POST", url: `/accounts/collisions/${anonymousListId}/resolve`, payload: { resolution: "combine" } },
        session
      )
    );
    expect(resolve.statusCode).toBe(204);

    // The intended Account's list got the merge...
    const items = await device(withSession({ method: "GET", url: `/lists/${accountListId}/items` }, session));
    expect(items.json().items[0].quantity).toBe(3);

    // ...and the stranger's identically-named list is untouched.
    const strangerItems = await stranger(
      withSession({ method: "GET", url: `/lists/${strangerList.json().id}/items` }, strangerSession)
    );
    expect(strangerItems.json().items[0].quantity).toBe(9);
  });
});
