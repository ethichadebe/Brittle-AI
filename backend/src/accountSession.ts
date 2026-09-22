import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";

export const SESSION_COOKIE = "accucery_session";

// 30 days. Long enough that a Shopper who signs up does not have to sign in
// again every few days; short enough that a session left signed in on a
// device stops working within a season rather than forever.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

declare module "fastify" {
  interface FastifyRequest {
    // Set only when the session cookie names a real, unexpired Session.
    // Nothing downstream should treat its absence as an error — most routes
    // do not require an Account yet (see ADR 0003).
    accountId?: string;
  }
}

export async function createSession(accountId: string): Promise<{ id: string; expiresAt: Date }> {
  return prisma.session.create({
    data: { accountId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
}

function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

// Requires registerDeviceId to have run first — it registers @fastify/cookie,
// which this reuses rather than registering a second time.
export async function registerAccountSession(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (req: FastifyRequest) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    if (!sessionId) return;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt.getTime() <= Date.now()) return;

    req.accountId = session.accountId;
  });

  app.decorateReply("signIn", async function (this: FastifyReply, accountId: string) {
    const session = await createSession(accountId);
    setSessionCookie(this, session.id, session.expiresAt);
  });

  app.decorateReply("signOut", async function (this: FastifyReply) {
    const req = this.request;
    const sessionId = req.cookies[SESSION_COOKIE];
    if (sessionId) {
      // A session id that does not exist any more is not an error here —
      // signing out is idempotent by design.
      await prisma.session.deleteMany({ where: { id: sessionId } });
    }
    clearSessionCookie(this);
  });
}

declare module "fastify" {
  interface FastifyReply {
    signIn(accountId: string): Promise<void>;
    signOut(): Promise<void>;
  }
}
