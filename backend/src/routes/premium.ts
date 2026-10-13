import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { LIMITS, limiter, tooMany } from "../rateLimit.js";
import { isPlan, paystackConfig, signatureValid, PaystackError } from "../payments/paystack.js";
import {
  PremiumError,
  cancel,
  defaultDeps,
  handleEvent,
  manageLink,
  premiumStatus,
  settleCheckout,
  startCheckout,
  type Outcome,
  type PremiumStatus,
} from "../payments/premium.js";

// Premium (#171): the shopper's side, and Paystack's webhook.

function fail(reply: { status(code: number): { send(body: unknown): unknown } }, e: unknown) {
  if (e instanceof PremiumError) return reply.status(e.status).send({ error: e.message, code: e.code });
  if (e instanceof PaystackError) {
    console.error("[premium] Paystack:", e.message);
    return reply.status(502).send({ error: "Couldn't reach the payment provider. Try again in a minute.", code: "paystack" });
  }
  throw e;
}

export async function premiumRoutes(app: FastifyInstance) {
  // GET /premium: what the Premium page shows. Signed out, just the prices.
  app.get<{ Reply: PremiumStatus }>("/premium", async (req) => premiumStatus(req.accountId ?? null));

  // POST /premium/checkout: a Paystack payment page for this Account.
  app.post<{ Body: { plan?: string } }>("/premium/checkout", async (req, reply) => {
    if (!req.accountId) return reply.status(401).send({ error: "Sign in to get Premium", code: "sign-in" });
    const plan = req.body?.plan;
    if (!isPlan(plan)) return reply.status(400).send({ error: "Pick monthly or yearly", code: "plan" });
    const account = await prisma.account.findUnique({ where: { id: req.accountId } });
    if (!account) return reply.status(401).send({ error: "Sign in to get Premium", code: "sign-in" });
    const wait = limiter.take(`checkout:${account.id}`, LIMITS.checkoutsPerAccount);
    if (wait) return tooMany(reply, wait, "checkouts");
    try {
      return await startCheckout(account, plan);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // POST /premium/confirm: the return page asks whether its payment went
  // through. Checked with Paystack, never taken from the browser's word.
  app.post<{ Body: { reference?: string }; Reply: { outcome: Outcome; status: PremiumStatus } }>(
    "/premium/confirm",
    async (req, reply) => {
      if (!req.accountId) return reply.status(401).send({ error: "Sign in", code: "sign-in" } as never);
      const reference = req.body?.reference;
      if (typeof reference !== "string" || !reference) return reply.status(400).send({ error: "No payment named", code: "reference" } as never);
      try {
        const outcome = await settleCheckout(reference, defaultDeps(), req.accountId);
        return { outcome, status: await premiumStatus(req.accountId) };
      } catch (e) {
        return fail(reply, e) as never;
      }
    }
  );

  // POST /premium/cancel: no more renewals. Premium lasts to the end of
  // what's paid for, or of the trial.
  app.post<{ Reply: PremiumStatus }>("/premium/cancel", async (req, reply) => {
    if (!req.accountId) return reply.status(401).send({ error: "Sign in", code: "sign-in" } as never);
    try {
      await cancel(req.accountId);
      return premiumStatus(req.accountId);
    } catch (e) {
      return fail(reply, e) as never;
    }
  });

  // GET /premium/manage-link: Paystack's own page for changing the card.
  app.get<{ Reply: { url: string } }>("/premium/manage-link", async (req, reply) => {
    if (!req.accountId) return reply.status(401).send({ error: "Sign in", code: "sign-in" } as never);
    try {
      return { url: await manageLink(req.accountId) };
    } catch (e) {
      return fail(reply, e) as never;
    }
  });

  // POST /payments/paystack/webhook: Paystack's own notices. Signed over
  // the exact bytes it sent, so this route keeps the body raw.
  await app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    hook.post("/payments/paystack/webhook", async (req, reply) => {
      const raw = req.body as Buffer;
      if (!Buffer.isBuffer(raw) || !signatureValid(raw, req.headers["x-paystack-signature"], paystackConfig().secretKey)) {
        return reply.status(401).send({ error: "Bad signature" });
      }
      let event: { event?: string; data?: unknown };
      try {
        event = JSON.parse(raw.toString("utf8"));
      } catch {
        return reply.status(400).send({ error: "Not JSON" });
      }
      try {
        const result = await handleEvent(event as never);
        return { ok: true, result };
      } catch (e) {
        // Not a 200, so Paystack delivers it again later.
        console.error(`[premium] webhook ${event.event} failed:`, e instanceof Error ? e.message : e);
        return reply.status(500).send({ error: "Try again" });
      }
    });
  });
}
