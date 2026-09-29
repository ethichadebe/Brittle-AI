import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../password.js";
import { claimAnonymousLists, type ListCollision } from "../claimAnonymousLists.js";
import { resolveListCollision, type CollisionResolution } from "../resolveListCollision.js";

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
