import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../password.js";
import { claimAnonymousLists, type ListCollision } from "../claimAnonymousLists.js";
import { resolveListCollision, type CollisionResolution } from "../resolveListCollision.js";
import { LIMITS, limiter, tooMany } from "../rateLimit.js";
import { issueDeviceId } from "../deviceId.js";
import { appUrl, maskEmail, sendMail } from "../mail/mailer.js";
import { alreadyRegisteredEmail, confirmEmail, resetPasswordEmail } from "../mail/templates.js";
import { CONFIRM_TTL_MS, hashToken, newToken, RESET_TTL_MS } from "../linkTokens.js";

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

// One answer for every link that can't be used, whatever the reason: expired,
// used already, or never real.
const LINK_INVALID = { error: "This link has expired or has already been used.", code: "link-invalid" } as never;

export async function accountsRoutes(app: FastifyInstance) {
  // POST /accounts — sign up. #148: no Account yet. A link is emailed, and
  // the Account is created when it's opened (POST /accounts/confirm). The
  // answer is the same whether or not the email already has an account: one
  // that does gets an email saying so instead, so only its owner finds out.
  app.post<{
    Body: { email?: string; password?: string };
    Reply: { pending: true; email: string };
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
    const emailWait = limiter.take(`email:${email}`, LIMITS.emailsPerAddress);
    if (emailWait) return tooMany(reply, emailWait, "emails to this address");

    // Hashed either way, so the two answers take the same time.
    const passwordHash = await hashPassword(password);
    const existing = await prisma.account.findUnique({ where: { email } });
    const base = appUrl();

    try {
      if (existing) {
        await sendMail(alreadyRegisteredEmail(email, `${base}/sign-in`, `${base}/forgot-password`));
      } else {
        // Signing up again replaces the last link, so only the newest works.
        const { token, hash } = newToken();
        await prisma.$transaction([
          prisma.pendingSignup.deleteMany({ where: { OR: [{ email }, { expiresAt: { lt: new Date() } }] } }),
          prisma.pendingSignup.create({
            data: { tokenHash: hash, email, passwordHash, expiresAt: new Date(Date.now() + CONFIRM_TTL_MS) },
          }),
        ]);
        await sendMail(confirmEmail(email, `${base}/confirm-email?token=${token}`));
      }
    } catch (err) {
      req.log.error({ err }, `sign-up email to ${maskEmail(email)} failed`);
      return reply.status(502).send({ error: "We couldn't send the email. Try again in a minute." } as never);
    }

    return reply.status(202).send({ pending: true, email });
  });

  // POST /accounts/confirm — #148: the link from the sign-up email. Creates
  // the Account, signs this device in and claims its lists, as sign-up did.
  app.post<{
    Body: { token?: string };
    Reply: SignedIn;
  }>("/accounts/confirm", async (req, reply) => {
    const tokenHash = hashToken(String(req.body?.token ?? ""));
    const pending = await prisma.pendingSignup.findUnique({ where: { tokenHash } });
    if (!pending || pending.expiresAt <= new Date()) return reply.status(400).send(LINK_INVALID);

    // Works once: of two requests racing with the same link, one deletes it.
    const { count } = await prisma.pendingSignup.deleteMany({ where: { tokenHash } });
    if (count === 0) return reply.status(400).send(LINK_INVALID);

    let account;
    try {
      account = await prisma.account.create({ data: { email: pending.email, passwordHash: pending.passwordHash } });
    } catch {
      // The email got an account another way meanwhile; this link is spent.
      return reply.status(400).send(LINK_INVALID);
    }
    await prisma.pendingSignup.deleteMany({ where: { email: pending.email } });

    // Per ADR 0003 / #85: whatever lists this device already has move onto
    // the new Account. It has none of its own, so nothing can collide.
    const collisions = await claimAnonymousLists(req.deviceId, account.id);

    await reply.signIn(account.id);
    return reply.status(201).send({ ...toPublic(account), collisions });
  });

  // POST /accounts/password-reset — #149: emails a link to choose a new
  // password. The same answer whether or not the email has an account.
  app.post<{ Body: { email?: string } }>("/accounts/password-reset", async (req, reply) => {
    const email = req.body?.email ? normaliseEmail(req.body.email) : "";
    if (!EMAIL_RE.test(email)) return reply.status(400).send({ error: "A valid email is required" } as never);

    const wait = Math.max(
      limiter.take(`reset:device:${req.deviceId}`, LIMITS.resetsPerDevice),
      limiter.take(`email:${email}`, LIMITS.emailsPerAddress)
    );
    if (wait) return tooMany(reply, wait, "reset emails");

    const account = await prisma.account.findUnique({ where: { email } });
    if (account) {
      const { token, hash } = newToken();
      try {
        // Only the newest link works.
        await prisma.$transaction([
          prisma.passwordReset.deleteMany({ where: { OR: [{ accountId: account.id }, { expiresAt: { lt: new Date() } }] } }),
          prisma.passwordReset.create({
            data: { tokenHash: hash, accountId: account.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
          }),
        ]);
        await sendMail(resetPasswordEmail(email, `${appUrl()}/reset-password?token=${token}`));
      } catch (err) {
        // Logged, not answered: a different answer here would say the
        // account exists.
        req.log.error({ err }, `reset email to ${maskEmail(email)} failed`);
      }
    }
    return reply.status(202).send({ sent: true });
  });

  // POST /accounts/password-reset/complete — #149: the new password. Every
  // session for the account is signed out, this one included: the shopper
  // then signs in with the new password, which also claims this device's
  // lists as any sign-in does.
  app.post<{
    Body: { token?: string; password?: string };
    Reply: { email: string };
  }>("/accounts/password-reset/complete", async (req, reply) => {
    const password = req.body?.password ?? "";
    if (password.length < MIN_PASSWORD_LENGTH) {
      return reply
        .status(400)
        .send({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` } as never);
    }

    const tokenHash = hashToken(String(req.body?.token ?? ""));
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash }, include: { account: true } });
    if (!reset || reset.expiresAt <= new Date()) return reply.status(400).send(LINK_INVALID);
    const { count } = await prisma.passwordReset.deleteMany({ where: { tokenHash } });
    if (count === 0) return reply.status(400).send(LINK_INVALID);

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.account.update({ where: { id: reset.accountId }, data: { passwordHash } }),
      prisma.session.deleteMany({ where: { accountId: reset.accountId } }),
      prisma.passwordReset.deleteMany({ where: { accountId: reset.accountId } }),
    ]);
    await reply.signOut();
    return reply.status(200).send({ email: reset.account.email });
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
