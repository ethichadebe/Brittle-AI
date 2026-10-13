import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PremiumOutcome, PremiumStatus } from "@accucery/types";
import { prisma } from "../db.js";
import { appUrl } from "../mail/mailer.js";
import {
  PRICES_CENTS,
  TRIAL_DAYS,
  paystackClient,
  paystackConfig,
  paystackReady,
  type PaystackClient,
  type PaystackConfig,
  type Plan,
  type Transaction,
} from "./paystack.js";

// Premium (#171): who has it, and the only ways it changes.
//
// An Account is Premium while its accessUntil is in the future. Only two
// things move that forward, and both come from Paystack rather than the
// browser: a transaction this server verified with Paystack's API, and a
// webhook signed with the secret key. A lapse needs no event at all: when a
// renewal fails, accessUntil simply passes.
//
// Free trials (decided with the owner, 2026-10-13): 7 days, one per Account
// and one per card. A trial takes a small card check, refunded straight
// away, and the subscription's first charge is set for 7 days later. The card
// check is what yields the card's signature, which is how a second trial on
// the same card under a new email is refused.

const DAY_MS = 24 * 60 * 60 * 1000;
/** A renewal's webhook can arrive a little after the period ends. */
export const GRACE_MS = DAY_MS;

export interface PremiumDeps {
  client: PaystackClient;
  config: PaystackConfig;
  now: () => Date;
}

export function defaultDeps(): PremiumDeps {
  const config = paystackConfig();
  return { client: paystackClient(config), config, now: () => new Date() };
}

export function addPeriod(from: Date, plan: Plan): Date {
  const d = new Date(from);
  if (plan === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

const later = (a: Date | null | undefined, b: Date) => (a && a > b ? a : b);

export type { PremiumStatus };

export async function premiumStatus(accountId: string | null, deps: Pick<PremiumDeps, "config" | "now"> = defaultDeps()): Promise<PremiumStatus> {
  const now = deps.now();
  const sub = accountId ? await prisma.subscription.findUnique({ where: { accountId } }) : null;
  const premium = Boolean(sub?.accessUntil && sub.accessUntil > now);
  return {
    available: paystackReady(deps.config),
    premium,
    plan: premium ? ((sub?.plan as Plan) ?? null) : null,
    accessUntil: premium && sub?.accessUntil ? sub.accessUntil.toISOString() : null,
    trialEndsAt: premium && sub?.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt.toISOString() : null,
    trialing: Boolean(premium && sub?.trialEndsAt && sub.trialEndsAt > now),
    cancelled: Boolean(premium && sub?.cancelled),
    // Once refused (the card had one before), the next checkout is a paid
    // one: offering the trial again would only refuse it again.
    trialAvailable: !sub?.trialStartedAt && !sub?.trialRefusedAt,
    prices: PRICES_CENTS,
    trialDays: TRIAL_DAYS,
  };
}

export async function isPremium(accountId: string | null, now = new Date()): Promise<boolean> {
  if (!accountId) return false;
  const sub = await prisma.subscription.findUnique({ where: { accountId }, select: { accessUntil: true } });
  return Boolean(sub?.accessUntil && sub.accessUntil > now);
}

export class PremiumError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
  }
}

/** Starts a Paystack checkout; the shopper is sent to the returned url. */
export async function startCheckout(account: { id: string; email: string }, plan: Plan, deps: PremiumDeps = defaultDeps()): Promise<{ url: string; trial: boolean }> {
  if (!paystackReady(deps.config)) throw new PremiumError("Premium isn't available yet.", 503, "unavailable");
  const status = await premiumStatus(account.id, deps);
  if (status.premium && !status.cancelled) throw new PremiumError("You already have Premium.", 409, "already-premium");

  const trial = status.trialAvailable;
  const reference = `acc-${randomUUID()}`;
  await prisma.premiumCheckout.create({ data: { reference, accountId: account.id, plan, purpose: trial ? "trial" : "subscribe" } });

  const { authorization_url } = await deps.client.initialize({
    email: account.email,
    reference,
    callback_url: `${appUrl()}/premium/return`,
    // A trial is a small card check, refunded; otherwise the plan's own price.
    amount: trial ? deps.config.cardCheckCents : PRICES_CENTS[plan],
    ...(trial ? {} : { plan: deps.config.planCodes[plan] }),
    // Cards only: other channels can't be charged again for a subscription.
    channels: ["card"],
    metadata: { purpose: trial ? "trial" : "subscribe", plan },
  });
  return { url: authorization_url, trial };
}

export type Outcome = PremiumOutcome;

const sameEmail = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Settles a checkout once Paystack says it was paid. Safe to call any number
 * of times, from the webhook and the return page alike: only the first call
 * that finds it paid does anything.
 */
export async function settleCheckout(reference: string, deps: PremiumDeps = defaultDeps(), onlyFor?: string): Promise<Outcome> {
  const checkout = await prisma.premiumCheckout.findUnique({ where: { reference }, include: { account: true } });
  if (!checkout || (onlyFor && checkout.accountId !== onlyFor)) throw new PremiumError("No such checkout.", 404, "not-found");
  // Settled already (or being settled right now): the same answer again.
  if (checkout.handledAt) return (checkout.outcome as Outcome | null) ?? "pending";

  const tx = await deps.client.verify(reference);
  if (tx.status !== "success") return "pending";
  // The payment has to be the one this server asked for, by this Account.
  if (!sameEmail(tx.customer?.email, checkout.account.email)) {
    throw new PremiumError("That payment isn't for this account.", 409, "wrong-account");
  }

  // Claim it: of two callers racing, only one gets past this.
  const claimed = await prisma.premiumCheckout.updateMany({ where: { reference, handledAt: null }, data: { handledAt: deps.now() } });
  if (claimed.count === 0) {
    const now = await prisma.premiumCheckout.findUnique({ where: { reference }, select: { outcome: true } });
    return (now?.outcome as Outcome | null) ?? "pending";
  }

  const plan = checkout.plan as Plan;
  try {
    const outcome =
      checkout.purpose === "trial" ? await startTrial(checkout.accountId, plan, tx, deps) : await subscribed(checkout.accountId, plan, tx, deps);
    await prisma.premiumCheckout.update({ where: { reference }, data: { outcome } });
    return outcome;
  } catch (e) {
    // Let the next webhook delivery, or the return page, try again.
    await prisma.premiumCheckout.update({ where: { reference }, data: { handledAt: null } });
    throw e;
  }
}

async function refundCardCheck(reference: string, deps: PremiumDeps): Promise<void> {
  try {
    await deps.client.refund(reference);
  } catch (e) {
    // The trial or refusal stands either way; a failed refund is for the
    // owner to see and settle in the Paystack dashboard.
    console.error(`[premium] card check ${reference} not refunded:`, e instanceof Error ? e.message : e);
  }
}

async function startTrial(accountId: string, plan: Plan, tx: Transaction, deps: PremiumDeps): Promise<Outcome> {
  const now = deps.now();
  const auth = tx.authorization;
  const refuse = async (outcome: Outcome) => {
    await prisma.subscription.upsert({
      where: { accountId },
      create: { accountId, plan, trialRefusedAt: now, customerCode: tx.customer?.customer_code ?? null },
      update: { trialRefusedAt: now },
    });
    await refundCardCheck(tx.reference, deps);
    return outcome;
  };

  if (!auth?.reusable || !auth.signature) return refuse("card-not-reusable");

  // Claim the card. Its signature is the key, so a second claim fails even
  // if two trials race.
  try {
    await prisma.trialCard.create({ data: { signature: auth.signature, accountId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return refuse("trial-used");
    throw e;
  }

  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  let created;
  try {
    created = await deps.client.createSubscription({
      customer: tx.customer?.customer_code ?? tx.customer?.email ?? "",
      plan: deps.config.planCodes[plan],
      authorization: auth.authorization_code,
      start_date: trialEndsAt.toISOString(),
    });
  } catch (e) {
    // No trial after all: the card is free for the next attempt.
    await prisma.trialCard.delete({ where: { signature: auth.signature } });
    throw e;
  }

  try {
    await recordTrial(accountId, plan, tx, trialEndsAt, created, now);
  } catch (e) {
    // Paystack now has a subscription that would charge this card in 7 days
    // for a trial this server didn't record. Stop it, and free the card, so
    // the shopper can simply try again.
    await deps.client
      .disableSubscription(created.subscription_code, created.email_token ?? "")
      .catch((err) => console.error(`[premium] couldn't stop ${created.subscription_code} after a failed save:`, err instanceof Error ? err.message : err));
    await prisma.trialCard.delete({ where: { signature: auth.signature } }).catch(() => {});
    throw e;
  }
  await refundCardCheck(tx.reference, deps);
  return "trial-started";
}

async function recordTrial(
  accountId: string,
  plan: Plan,
  tx: Transaction,
  trialEndsAt: Date,
  created: { subscription_code: string; email_token?: string },
  now: Date
): Promise<void> {
  const data = {
    plan,
    trialStartedAt: now,
    trialEndsAt,
    trialRefusedAt: null,
    accessUntil: new Date(trialEndsAt.getTime() + GRACE_MS),
    customerCode: tx.customer?.customer_code ?? null,
    subscriptionCode: created.subscription_code,
    emailToken: created.email_token ?? null,
    cancelled: false,
  };
  await prisma.subscription.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
}

async function subscribed(accountId: string, plan: Plan, tx: Transaction, deps: PremiumDeps): Promise<Outcome> {
  const now = deps.now();
  const existing = await prisma.subscription.findUnique({ where: { accountId } });
  // Paystack renews one period from today's charge, so that's what's paid for.
  const accessUntil = later(existing?.accessUntil, new Date(addPeriod(now, plan).getTime() + GRACE_MS));
  const data = { plan, accessUntil, cancelled: false, customerCode: tx.customer?.customer_code ?? existing?.customerCode ?? null };
  // Paystack makes the subscription itself for a plan checkout; its code and
  // email token arrive with the subscription.create webhook.
  await prisma.subscription.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
  return "subscribed";
}

// ── Webhooks ──

/* eslint-disable @typescript-eslint/no-explicit-any -- Paystack's event payloads, read field by field */
const planCodeOf = (plan: any): string => (typeof plan === "string" ? plan : (plan?.plan_code ?? ""));

function planFor(code: string, config: PaystackConfig): Plan | null {
  if (code && code === config.planCodes.monthly) return "monthly";
  if (code && code === config.planCodes.yearly) return "yearly";
  return null;
}

async function subscriptionFor(data: any) {
  const code = data?.subscription_code ?? data?.subscription?.subscription_code;
  if (code) {
    const byCode = await prisma.subscription.findUnique({ where: { subscriptionCode: code } });
    if (byCode) return byCode;
  }
  const customer = data?.customer?.customer_code;
  if (customer) {
    const byCustomer = await prisma.subscription.findFirst({ where: { customerCode: customer } });
    if (byCustomer) return byCustomer;
  }
  const email = data?.customer?.email;
  if (typeof email === "string" && email) {
    const account = await prisma.account.findUnique({ where: { email: email.trim().toLowerCase() }, include: { subscription: true } });
    if (account?.subscription) return account.subscription;
  }
  return null;
}

/** One webhook event, already checked as Paystack's. */
export async function handleEvent(event: { event?: string; data?: any }, deps: PremiumDeps = defaultDeps()): Promise<string> {
  const data = event.data ?? {};
  const now = deps.now();
  switch (event.event) {
    case "charge.success": {
      const reference = data.reference;
      if (typeof reference === "string" && (await prisma.premiumCheckout.findUnique({ where: { reference } }))) {
        return settleCheckout(reference, deps);
      }
      // A renewal: the next period is paid for.
      const plan = planFor(planCodeOf(data.plan), deps.config);
      if (!plan) return "ignored";
      const sub = await subscriptionFor(data);
      if (!sub) return "unknown-subscription";
      // Paystack delivers again until it gets a 200, sometimes hours later:
      // each charge counts once.
      if (typeof reference !== "string" || !reference) return "ignored";
      try {
        await prisma.premiumCharge.create({ data: { reference, accountId: sub.accountId } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "already-handled";
        throw e;
      }
      // Paid today for the period starting today.
      const accessUntil = later(sub.accessUntil, new Date(addPeriod(now, plan).getTime() + GRACE_MS));
      await prisma.subscription.update({ where: { accountId: sub.accountId }, data: { plan, accessUntil, trialEndsAt: null } });
      return "renewed";
    }
    case "subscription.create": {
      const sub = await subscriptionFor({ customer: data.customer });
      if (!sub) return "unknown-subscription";
      await prisma.subscription.update({
        where: { accountId: sub.accountId },
        data: { subscriptionCode: data.subscription_code ?? sub.subscriptionCode, emailToken: data.email_token ?? sub.emailToken },
      });
      return "linked";
    }
    case "subscription.not_renew":
    case "subscription.disable": {
      const sub = await subscriptionFor(data);
      if (!sub) return "unknown-subscription";
      // Paid-for time (or the rest of a trial) is kept; it just won't renew.
      await prisma.subscription.update({ where: { accountId: sub.accountId }, data: { cancelled: true } });
      return "cancelled";
    }
    case "invoice.payment_failed":
      // Nothing to change: without a successful renewal, accessUntil passes.
      return "noted";
    default:
      return "ignored";
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Shopper actions ──

export async function cancel(accountId: string, deps: PremiumDeps = defaultDeps()): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { accountId } });
  if (!sub?.accessUntil || sub.accessUntil <= deps.now()) throw new PremiumError("You don't have Premium.", 404, "not-premium");
  if (sub.cancelled) return;
  if (!sub.subscriptionCode || !sub.emailToken) {
    throw new PremiumError("Your subscription is still being set up. Try again in a minute.", 409, "not-linked");
  }
  await deps.client.disableSubscription(sub.subscriptionCode, sub.emailToken);
  await prisma.subscription.update({ where: { accountId }, data: { cancelled: true } });
}

export async function manageLink(accountId: string, deps: PremiumDeps = defaultDeps()): Promise<string> {
  const sub = await prisma.subscription.findUnique({ where: { accountId } });
  if (!sub?.subscriptionCode) throw new PremiumError("No subscription to manage.", 404, "not-linked");
  return (await deps.client.manageLink(sub.subscriptionCode)).link;
}

/**
 * Before an Account is deleted: stop Paystack charging it. A subscription
 * that's already cancelled or over needs nothing. If Paystack can't be
 * reached, the deletion waits rather than leave a card being charged for an
 * account that no longer exists.
 */
export async function stopBillingBeforeDelete(accountId: string, deps: PremiumDeps = defaultDeps()): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { accountId } });
  if (!sub?.subscriptionCode || !sub.emailToken || sub.cancelled) return;
  if (sub.accessUntil && sub.accessUntil <= deps.now()) return;
  await deps.client.disableSubscription(sub.subscriptionCode, sub.emailToken);
}
