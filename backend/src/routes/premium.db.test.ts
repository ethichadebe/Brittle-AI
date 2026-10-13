import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../app.js";
import { testPrisma } from "../test/testDb.js";
import { signUp } from "../test/signUp.js";
import { DEVICE_ID_COOKIE } from "../deviceId.js";

// #171: Premium through Paystack, against a stand-in Paystack that behaves as
// its API spec says (github.com/PaystackOSS/openapi). What the real one does
// in test mode is for the owner's first run.

const SECRET = "sk_test_stand_in_secret"; // gitleaks:allow — invented test value, not a real key
const PLANS = { monthly: "PLN_monthly_test", yearly: "PLN_yearly_test" };
const PASSWORD = "correct horse battery staple";
const DAY = 24 * 60 * 60 * 1000;

interface Card {
  authorization_code: string;
  signature: string;
  reusable: boolean;
}
const card = (n: string, reusable = true): Card => ({ authorization_code: `AUTH_${n}`, signature: `SIG_${n}`, reusable });

// ── The stand-in Paystack ──
const paystack = {
  transactions: new Map<string, { email: string; amount: number; plan?: string; channels?: string[]; callback_url: string; status: string; authorization?: Card }>(),
  subscriptions: [] as { customer: string; plan: string; authorization: string; start_date: string; code: string; token: string }[],
  refunds: [] as string[],
  disabled: [] as { code: string; token: string }[],
  failDisable: false,
  reset() {
    this.transactions.clear();
    this.subscriptions = [];
    this.refunds = [];
    this.disabled = [];
    this.failDisable = false;
  },
  /** The shopper pays on Paystack's page. */
  pay(reference: string, c: Card) {
    const tx = this.transactions.get(reference)!;
    tx.status = "success";
    tx.authorization = c;
  },
};

const server = http.createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { status: false, message: "Invalid key" });
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url ?? "/", "http://x");
  const customer = (email: string) => ({ email, customer_code: `CUS_${email}` });

  if (req.method === "POST" && url.pathname === "/transaction/initialize") {
    paystack.transactions.set(body.reference, { ...body, status: "abandoned" });
    return send(200, { status: true, data: { authorization_url: `https://checkout.paystack.test/${body.reference}`, reference: body.reference } });
  }
  const verify = url.pathname.match(/^\/transaction\/verify\/(.+)$/);
  if (req.method === "GET" && verify) {
    const tx = paystack.transactions.get(decodeURIComponent(verify[1]));
    if (!tx) return send(404, { status: false, message: "Transaction reference not found" });
    return send(200, { status: true, data: { status: tx.status, reference: decodeURIComponent(verify[1]), amount: tx.amount, customer: customer(tx.email), authorization: tx.authorization, plan: tx.plan ?? null } });
  }
  if (req.method === "POST" && url.pathname === "/refund") {
    paystack.refunds.push(body.transaction);
    return send(200, { status: true, data: {} });
  }
  if (req.method === "POST" && url.pathname === "/subscription") {
    const n = paystack.subscriptions.length + 1;
    const sub = { ...body, code: `SUB_${n}`, token: `tok_${n}` };
    paystack.subscriptions.push(sub);
    return send(200, { status: true, data: { subscription_code: sub.code, email_token: sub.token, status: "active" } });
  }
  if (req.method === "POST" && url.pathname === "/subscription/disable") {
    if (paystack.failDisable) return send(500, { status: false, message: "Down" });
    paystack.disabled.push(body);
    return send(200, { status: true, data: {} });
  }
  const manage = url.pathname.match(/^\/subscription\/(.+)\/manage\/link$/);
  if (req.method === "GET" && manage) return send(200, { status: true, data: { link: `https://paystack.test/manage/${manage[1]}` } });
  send(404, { status: false, message: "Not here" });
});

let app: FastifyInstance;

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  Object.assign(process.env, {
    PAYSTACK_SECRET_KEY: SECRET,
    PAYSTACK_BASE_URL: `http://127.0.0.1:${port}`,
    PAYSTACK_PLAN_MONTHLY: PLANS.monthly,
    PAYSTACK_PLAN_YEARLY: PLANS.yearly,
  });
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await new Promise((r) => server.close(r));
  for (const k of ["PAYSTACK_SECRET_KEY", "PAYSTACK_BASE_URL", "PAYSTACK_PLAN_MONTHLY", "PAYSTACK_PLAN_YEARLY"]) delete process.env[k];
  await testPrisma.$disconnect();
});

beforeEach(() => paystack.reset());

// A browser: keeps the cookies the server sets.
function browser() {
  const cookies: Record<string, string> = { [DEVICE_ID_COOKIE]: randomUUID() };
  return {
    async send(opts: InjectOptions) {
      const res = await app.inject({ ...opts, cookies });
      for (const c of res.cookies) {
        if (c.value === "" || (c.expires && c.expires.getTime() <= Date.now())) delete cookies[c.name];
        else cookies[c.name] = c.value;
      }
      return res;
    },
  };
}

async function shopper() {
  const b = browser();
  const email = `premium-${randomUUID()}@example.com`;
  const res = await signUp(b.send, { email, password: PASSWORD });
  expect(res.statusCode).toBe(201);
  return { b, email, accountId: res.json().id as string };
}

const status = async (b: ReturnType<typeof browser>) => (await b.send({ method: "GET", url: "/premium" })).json();

/** Starts a checkout and answers the reference Paystack was given. */
async function checkout(b: ReturnType<typeof browser>, plan = "monthly") {
  const res = await b.send({ method: "POST", url: "/premium/checkout", payload: { plan } });
  expect(res.statusCode).toBe(200);
  const reference = res.json().url.split("/").pop() as string;
  return { reference, trial: res.json().trial as boolean, sent: paystack.transactions.get(reference)! };
}

const confirm = (b: ReturnType<typeof browser>, reference: string) => b.send({ method: "POST", url: "/premium/confirm", payload: { reference } });

function webhook(event: unknown, { secret = SECRET, raw }: { secret?: string; raw?: string } = {}) {
  const body = raw ?? JSON.stringify(event);
  return app.inject({
    method: "POST",
    url: "/payments/paystack/webhook",
    headers: { "content-type": "application/json", "x-paystack-signature": createHmac("sha512", secret).update(body).digest("hex") },
    payload: body,
  });
}

describe("what the Premium page shows", () => {
  it("prices and a trial to anyone, signed in or not", async () => {
    const s = await status(browser());
    expect(s).toMatchObject({ available: true, premium: false, trialAvailable: true, trialDays: 7, prices: { monthly: 2900, yearly: 24900 } });
  });

  it("isn't for sale until Paystack is set up", async () => {
    const saved = process.env.PAYSTACK_PLAN_YEARLY;
    delete process.env.PAYSTACK_PLAN_YEARLY;
    try {
      const { b } = await shopper();
      expect((await status(b)).available).toBe(false);
      const res = await b.send({ method: "POST", url: "/premium/checkout", payload: { plan: "monthly" } });
      expect(res.statusCode).toBe(503);
    } finally {
      process.env.PAYSTACK_PLAN_YEARLY = saved;
    }
  });
});

describe("the 7-day free trial", () => {
  it("takes a small card check, then sets the first charge 7 days out and refunds the check", async () => {
    const { b } = await shopper();
    const { reference, trial, sent } = await checkout(b);
    expect(trial).toBe(true);
    expect(sent).toMatchObject({ amount: 1000, channels: ["card"] });
    expect(sent.plan).toBeUndefined();
    expect(sent.callback_url).toMatch(/\/premium\/return$/);

    paystack.pay(reference, card("A"));
    const res = await confirm(b, reference);

    expect(res.json().outcome).toBe("trial-started");
    expect(paystack.subscriptions).toHaveLength(1);
    const sub = paystack.subscriptions[0];
    expect(sub).toMatchObject({ plan: PLANS.monthly, authorization: "AUTH_A" });
    expect(Math.abs(Date.parse(sub.start_date) - (Date.now() + 7 * DAY))).toBeLessThan(60_000);
    expect(paystack.refunds).toEqual([reference]);
    expect(await status(b)).toMatchObject({ premium: true, trialing: true, plan: "monthly", trialAvailable: false });
  });

  it("isn't Premium before Paystack says the card check went through", async () => {
    const { b } = await shopper();
    const { reference } = await checkout(b);
    expect((await confirm(b, reference)).json().outcome).toBe("pending");
    expect((await status(b)).premium).toBe(false);
  });

  it("is handled once, whichever arrives first and however often", async () => {
    const { b } = await shopper();
    const { reference } = await checkout(b);
    paystack.pay(reference, card("A"));
    await webhook({ event: "charge.success", data: { reference } });
    // The same answer for the return page, a reload, or a repeat delivery.
    expect((await confirm(b, reference)).json().outcome).toBe("trial-started");
    expect((await confirm(b, reference)).json().outcome).toBe("trial-started");
    await webhook({ event: "charge.success", data: { reference } });
    expect(paystack.subscriptions).toHaveLength(1);
    expect(paystack.refunds).toEqual([reference]);
  });

  it("one per card: the same card under a new email is refused and refunded", async () => {
    const first = await shopper();
    const a = await checkout(first.b);
    paystack.pay(a.reference, card("A"));
    await confirm(first.b, a.reference);

    const second = await shopper();
    const again = await checkout(second.b);
    paystack.pay(again.reference, card("A"));
    expect((await confirm(second.b, again.reference)).json().outcome).toBe("trial-used");
    expect(paystack.subscriptions).toHaveLength(1);
    expect(paystack.refunds).toContain(again.reference);
    expect(await status(second.b)).toMatchObject({ premium: false, trialAvailable: false });

    // Their next checkout is the paid one, not another card check.
    const paid = await checkout(second.b);
    expect(paid.trial).toBe(false);
    expect(paid.sent).toMatchObject({ amount: 2900, plan: PLANS.monthly });
  });

  it("one per card, even after the first account is deleted", async () => {
    const first = await shopper();
    const a = await checkout(first.b);
    paystack.pay(a.reference, card("A"));
    await confirm(first.b, a.reference);
    expect((await first.b.send({ method: "DELETE", url: "/accounts/me", payload: { password: PASSWORD } })).statusCode).toBe(204);
    // The card is remembered without the account.
    expect(await testPrisma.trialCard.findUnique({ where: { signature: "SIG_A" } })).toMatchObject({ accountId: null });

    const second = await shopper();
    const again = await checkout(second.b);
    paystack.pay(again.reference, card("A"));
    expect((await confirm(second.b, again.reference)).json().outcome).toBe("trial-used");
  });

  it("one per account: a second checkout after the trial is a paid one", async () => {
    const { b, accountId } = await shopper();
    const a = await checkout(b);
    paystack.pay(a.reference, card("A"));
    await confirm(b, a.reference);
    await testPrisma.subscription.update({ where: { accountId }, data: { accessUntil: new Date(Date.now() - DAY), cancelled: true } });

    const next = await checkout(b);
    expect(next.trial).toBe(false);
    expect(next.sent).toMatchObject({ amount: 2900, plan: PLANS.monthly });
  });

  it("if the trial can't be saved, stops the Paystack subscription and frees the card", async () => {
    // Another row already holds the code Paystack is about to hand out, so
    // saving this trial fails after Paystack has made the subscription.
    const other = await shopper();
    await testPrisma.subscription.create({ data: { accountId: other.accountId, plan: "monthly", subscriptionCode: "SUB_1" } });

    const { b } = await shopper();
    const { reference } = await checkout(b);
    paystack.pay(reference, card("A"));
    expect((await confirm(b, reference)).statusCode).toBe(500);

    expect(paystack.disabled).toEqual([{ code: "SUB_1", token: "tok_1" }]);
    expect(await testPrisma.trialCard.findUnique({ where: { signature: "SIG_A" } })).toBeNull();
    expect((await status(b)).premium).toBe(false);
    // And it can be tried again.
    expect(await testPrisma.premiumCheckout.findUnique({ where: { reference } })).toMatchObject({ handledAt: null });
  });

  it("refuses a card that can't be charged again, and refunds it", async () => {
    const { b } = await shopper();
    const { reference } = await checkout(b);
    paystack.pay(reference, card("P", false));
    expect((await confirm(b, reference)).json().outcome).toBe("card-not-reusable");
    expect(paystack.subscriptions).toHaveLength(0);
    expect(paystack.refunds).toEqual([reference]);
    expect((await status(b)).premium).toBe(false);
  });
});

describe("paying", () => {
  async function paidShopper(plan = "monthly") {
    const s = await shopper();
    await testPrisma.subscription.create({ data: { accountId: s.accountId, plan, trialStartedAt: new Date(Date.now() - 30 * DAY) } });
    const c = await checkout(s.b, plan);
    paystack.pay(c.reference, card(randomUUID()));
    return { ...s, ...c };
  }

  it("a paid checkout gives a month, plus a day's grace for the renewal to arrive", async () => {
    const { b, reference } = await paidShopper();
    expect((await confirm(b, reference)).json().outcome).toBe("subscribed");
    const s = await status(b);
    expect(s).toMatchObject({ premium: true, trialing: false, plan: "monthly" });
    const expected = new Date();
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(Math.abs(Date.parse(s.accessUntil) - (expected.getTime() + DAY))).toBeLessThan(60_000);
  });

  it("a year for the yearly plan", async () => {
    const { b, reference } = await paidShopper("yearly");
    await confirm(b, reference);
    expect(Date.parse((await status(b)).accessUntil) - Date.now()).toBeGreaterThan(364 * DAY);
  });

  it("is only confirmed for the account that started it", async () => {
    const { reference } = await paidShopper();
    const other = await shopper();
    expect((await confirm(other.b, reference)).statusCode).toBe(404);
    expect((await status(other.b)).premium).toBe(false);
  });

  it("is refused if Paystack's customer isn't this account", async () => {
    const { b, reference } = await paidShopper();
    paystack.transactions.get(reference)!.email = "someone-else@example.com";
    expect((await confirm(b, reference)).statusCode).toBe(409);
    expect((await status(b)).premium).toBe(false);
  });

  it("can't be bought twice", async () => {
    const { b, reference } = await paidShopper();
    await confirm(b, reference);
    expect((await b.send({ method: "POST", url: "/premium/checkout", payload: { plan: "yearly" } })).statusCode).toBe(409);
  });

  it("needs an account and a real plan", async () => {
    expect((await browser().send({ method: "POST", url: "/premium/checkout", payload: { plan: "monthly" } })).statusCode).toBe(401);
    const { b } = await shopper();
    expect((await b.send({ method: "POST", url: "/premium/checkout", payload: { plan: "weekly" } })).statusCode).toBe(400);
  });
});

describe("Paystack's webhooks", () => {
  async function subscriber() {
    const s = await shopper();
    const accessUntil = new Date(Date.now() + 3 * DAY);
    await testPrisma.subscription.create({
      data: { accountId: s.accountId, plan: "monthly", accessUntil, customerCode: `CUS_${s.email}`, subscriptionCode: "SUB_X", emailToken: "tok_X" },
    });
    return { ...s, accessUntil };
  }

  it("refuses anything not signed with the secret key, and changes nothing", async () => {
    const { b, email } = await subscriber();
    const res = await webhook({ event: "subscription.disable", data: { subscription_code: "SUB_X", customer: { email } } }, { secret: "not-the-key" });
    expect(res.statusCode).toBe(401);
    expect((await status(b)).cancelled).toBe(false);
  });

  it("checks the exact bytes Paystack sent, spacing and all", async () => {
    const { b } = await subscriber();
    const raw = '{ "event" : "subscription.disable",\n  "data": { "subscription_code": "SUB_X" } }';
    expect((await webhook(null, { raw })).statusCode).toBe(200);
    expect((await status(b)).cancelled).toBe(true);
  });

  it("a renewal extends Premium by a period, once however often it's delivered", async () => {
    const { b, email } = await subscriber();
    const event = { event: "charge.success", data: { reference: "renewal-1", plan: { plan_code: PLANS.monthly }, customer: { email, customer_code: `CUS_${email}` } } };
    await webhook(event);
    const once = Date.parse((await status(b)).accessUntil);
    await webhook(event);
    expect(Date.parse((await status(b)).accessUntil)).toBe(once);
    expect(once - Date.now()).toBeGreaterThan(28 * DAY);
  });

  it("not renewing keeps what's paid for, then it lapses on its own", async () => {
    const { b, accountId } = await subscriber();
    await webhook({ event: "subscription.not_renew", data: { subscription_code: "SUB_X" } });
    expect(await status(b)).toMatchObject({ premium: true, cancelled: true });
    await testPrisma.subscription.update({ where: { accountId }, data: { accessUntil: new Date(Date.now() - 1000) } });
    expect((await status(b)).premium).toBe(false);
  });

  it("a failed renewal changes nothing: Premium ends when the paid time does", async () => {
    const { b, accessUntil } = await subscriber();
    await webhook({ event: "invoice.payment_failed", data: { subscription: { subscription_code: "SUB_X" } } });
    expect(Date.parse((await status(b)).accessUntil)).toBe(accessUntil.getTime());
  });

  it("links a paid checkout's subscription, so it can be cancelled", async () => {
    const s = await shopper();
    await testPrisma.subscription.create({ data: { accountId: s.accountId, plan: "monthly", trialStartedAt: new Date(0) } });
    const c = await checkout(s.b);
    paystack.pay(c.reference, card("Z"));
    await confirm(s.b, c.reference);
    expect((await s.b.send({ method: "POST", url: "/premium/cancel" })).statusCode).toBe(409);

    await webhook({ event: "subscription.create", data: { subscription_code: "SUB_NEW", email_token: "tok_NEW", customer: { email: s.email, customer_code: `CUS_${s.email}` } } });
    expect((await s.b.send({ method: "POST", url: "/premium/cancel" })).statusCode).toBe(200);
    expect(paystack.disabled).toEqual([{ code: "SUB_NEW", token: "tok_NEW" }]);
  });
});

describe("cancelling and deleting", () => {
  async function trialist() {
    const s = await shopper();
    const c = await checkout(s.b);
    paystack.pay(c.reference, card(randomUUID()));
    await confirm(s.b, c.reference);
    return s;
  }

  it("cancelling stops renewals at Paystack and keeps the rest of the trial", async () => {
    const { b } = await trialist();
    const res = await b.send({ method: "POST", url: "/premium/cancel" });
    expect(res.statusCode).toBe(200);
    expect(paystack.disabled).toEqual([{ code: "SUB_1", token: "tok_1" }]);
    expect(res.json()).toMatchObject({ premium: true, cancelled: true, trialing: true });
  });

  it("gives Paystack's page for changing the card", async () => {
    const { b } = await trialist();
    expect((await b.send({ method: "GET", url: "/premium/manage-link" })).json()).toEqual({ url: "https://paystack.test/manage/SUB_1" });
  });

  it("deleting the account cancels the subscription first", async () => {
    const { b } = await trialist();
    expect((await b.send({ method: "DELETE", url: "/accounts/me", payload: { password: PASSWORD } })).statusCode).toBe(204);
    expect(paystack.disabled).toEqual([{ code: "SUB_1", token: "tok_1" }]);
  });

  it("and if Paystack can't be reached, the account isn't deleted", async () => {
    const { b, accountId } = await trialist();
    paystack.failDisable = true;
    const res = await b.send({ method: "DELETE", url: "/accounts/me", payload: { password: PASSWORD } });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/couldn't cancel your Premium/);
    expect(await testPrisma.account.findUnique({ where: { id: accountId } })).not.toBeNull();
  });
});
