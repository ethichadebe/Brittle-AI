import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../password.js";
import { claimAnonymousLists, type ListCollision } from "../claimAnonymousLists.js";
import { resolveListCollision, type CollisionResolution } from "../resolveListCollision.js";
import { LIMITS, limiter, tooMany } from "../rateLimit.js";
import { issueDeviceId } from "../deviceId.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface AccountPublic {
  id: string;
  email: string;
}

interface SignedIn extends AccountPublic {
  // Non-empty only when this device had a list whose name and Store match
  // one already on the Account — see #86. The Shopper resolves each one via
  // POST /accounts/collisions/:anonymousListId/resolve.
  collisions: ListCollision[];
}

// Every response shape in this file is built explicitly, field by field —
// never a bare Prisma row — so a passwordHash can never leave this file by
// a `...account` spread someone adds later without reading this comment.
function toPublic(account: { id: string; email: string }): AccountPublic {
  return { id: account.id, email: account.email };
}

export async function accountsRoutes(app: FastifyInstance) {
  // POST /accounts — sign up
  app.post<{
    Body: { email?: string; password?: string };
    Reply: SignedIn;
  }>("/accounts", async (req, reply) => {
    const email = req.body.email ? normaliseEmail(req.body.email) : "";
    const password = req.body.password ?? "";

    // #152: a device making account after account is a script.
    const wait = limiter.take(`signup:${req.deviceId}`, LIMITS.signUpPerDevice);
    if (wait) return tooMany(reply, wait, "sign-ups from this device");

    if (!EMAIL_RE.test(email)) {
      return reply.status(400).send({ error: "A valid email is required" } as never);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return reply
        .status(400)
        .send({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` } as never);
    }

    const existing = await prisma.account.findUnique({ where: { email } });
    if (existing) {
      // Deliberately the same shape of failure as a validation error, not a
      // distinct "email taken" reason — see the PR for what this does and
      // does not protect against without an email-verification flow, which
      // does not exist in this codebase yet.
      return reply.status(409).send({ error: "Could not create an account with that email" } as never);
    }

    const passwordHash = await hashPassword(password);
    const account = await prisma.account.create({ data: { email, passwordHash } });

    // Per ADR 0003 / #85: whatever lists this device already has, made
    // before this Account existed, move onto it now. A brand-new Account
    // has no lists of its own, so nothing here can collide.
    const collisions = await claimAnonymousLists(req.deviceId, account.id);

    await reply.signIn(account.id);
    return reply.status(201).send({ ...toPublic(account), collisions });
  });

  // POST /accounts/sign-in
  app.post<{
    Body: { email?: string; password?: string };
    Reply: SignedIn;
  }>("/accounts/sign-in", async (req, reply) => {
    const email = req.body.email ? normaliseEmail(req.body.email) : "";
    const password = req.body.password ?? "";

    // #152: guessing one account's password from many devices, or many
    // accounts' from one device, is slowed to a stop either way. Counted
    // whether or not the email exists, so the limit says nothing about it.
    const wait = Math.max(
      limiter.take(`signin:email:${email}`, LIMITS.signInPerEmail),
      limiter.take(`signin:device:${req.deviceId}`, LIMITS.signInPerDevice)
    );
    if (wait) return tooMany(reply, wait, "sign-in attempts");

    const account = await prisma.account.findUnique({ where: { email } });
    // Same message whether the email does not exist or the password is
    // wrong — telling them apart would confirm which emails have accounts.
    const INVALID = { error: "Invalid email or password" } as never;
    if (!account) return reply.status(401).send(INVALID);

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) return reply.status(401).send(INVALID);

    // See #85: this device may have lists from before this sign-in.
    const collisions = await claimAnonymousLists(req.deviceId, account.id);

    await reply.signIn(account.id);
    return reply.status(200).send({ ...toPublic(account), collisions });
  });

  // POST /accounts/sign-out
  app.post("/accounts/sign-out", async (_req, reply) => {
    await reply.signOut();
    return reply.status(204).send();
  });

  // DELETE /accounts/me — #151: the Shopper deletes their Account, at once.
  app.delete<{ Body: { password?: string } }>("/accounts/me", async (req, reply) => {
    if (!req.accountId) return reply.status(401).send({ error: "Sign in required" } as never);

    const account = await prisma.account.findUnique({ where: { id: req.accountId } });
    if (!account) return reply.status(401).send({ error: "Sign in required" } as never);

    // The password, not just the session: a phone left signed in must not be
    // enough to delete someone's account. Guesses here count against the
    // same limit as sign-in (#152), or this would be a way around it.
    const wait = limiter.take(`signin:email:${account.email}`, LIMITS.signInPerEmail);
    if (wait) return tooMany(reply, wait, "password attempts");
    if (!(await verifyPassword(req.body?.password ?? "", account.passwordHash))) {
      return reply.status(401).send({ error: "That password isn't right" } as never);
    }

    // Lists are keyed by the Account's id, not a relation, so they go by
    // hand; their items follow by cascade. Sessions and substitute decisions
    // cascade from the Account itself. Popular Substitutes are counted from
    // those decisions each time (loadPopular), so nothing of this Account
    // stays in them; cached prices belong to the stores, not to anyone.
    await prisma.$transaction([
      prisma.list.deleteMany({ where: { userId: account.id } }),
      prisma.account.delete({ where: { id: account.id } }),
    ]);

    await reply.signOut();
    issueDeviceId(req, reply);
    return reply.status(204).send();
  });

  // GET /accounts/session — who, if anyone, this request is signed in as
  app.get<{ Reply: { account: AccountPublic | null } }>(
    "/accounts/session",
    async (req) => {
      if (!req.accountId) return { account: null };

      const account = await prisma.account.findUnique({ where: { id: req.accountId } });
      // The session cookie named a real session, but the Account behind it
      // is gone (deleted, per #88). Signed out, not an error.
      if (!account) return { account: null };

      return { account: toPublic(account) };
    }
  );

  // POST /accounts/collisions/:anonymousListId/resolve — #86
  app.post<{
    Params: { anonymousListId: string };
    Body: { resolution?: CollisionResolution };
  }>("/accounts/collisions/:anonymousListId/resolve", async (req, reply) => {
    if (!req.accountId) return reply.status(401).send({ error: "Sign in required" } as never);

    const { resolution } = req.body;
    if (resolution !== "combine" && resolution !== "keep-both") {
      return reply.status(400).send({ error: "resolution must be combine or keep-both" } as never);
    }

    const resolved = await resolveListCollision(
      req.deviceId,
      req.accountId,
      req.params.anonymousListId,
      resolution
    );
    if (!resolved) return reply.status(404).send({ error: "Collision not found" } as never);

    return reply.status(204).send();
  });
}
