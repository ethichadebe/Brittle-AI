import { createHmac, timingSafeEqual } from "node:crypto";

// Paystack's HTTP API (#171), for Premium. Plain fetch, no SDK, as for Resend.
// Its own API spec (github.com/PaystackOSS/openapi) is what these calls were
// written against.
//
// The secret key only ever goes in the Authorization header, and amounts are
// in cents (R29 = 2900).

const DEFAULT_BASE = "https://api.paystack.co";
const TIMEOUT_MS = 20_000;

export type Plan = "monthly" | "yearly";
export const PLANS: readonly Plan[] = ["monthly", "yearly"];
export const isPlan = (v: unknown): v is Plan => v === "monthly" || v === "yearly";

/** Shown on the Premium page; the charge itself is whatever the Paystack plan says. */
export const PRICES_CENTS: Record<Plan, number> = { monthly: 2900, yearly: 24900 };

export const TRIAL_DAYS = 7;

export interface PaystackConfig {
  secretKey: string;
  baseUrl: string;
  planCodes: Record<Plan, string>;
  /** The card check before a trial, refunded straight away. */
  cardCheckCents: number;
}

export function paystackConfig(): PaystackConfig {
  const cents = Number(process.env.PAYSTACK_CARD_CHECK_CENTS);
  return {
    secretKey: process.env.PAYSTACK_SECRET_KEY?.trim() ?? "",
    baseUrl: process.env.PAYSTACK_BASE_URL?.trim() || DEFAULT_BASE,
    planCodes: {
      monthly: process.env.PAYSTACK_PLAN_MONTHLY?.trim() ?? "",
      yearly: process.env.PAYSTACK_PLAN_YEARLY?.trim() ?? "",
    },
    cardCheckCents: Number.isInteger(cents) && cents > 0 ? cents : 1000,
  };
}

/** Premium can be sold: a key and both plans are set. */
export function paystackReady(c: PaystackConfig = paystackConfig()): boolean {
  return Boolean(c.secretKey && c.planCodes.monthly && c.planCodes.yearly);
}

/**
 * A webhook is Paystack's only if its x-paystack-signature header is the
 * HMAC-SHA512 of the exact body, keyed with the secret key. Compared in
 * constant time.
 */
export function signatureValid(rawBody: string | Buffer, header: unknown, secretKey: string): boolean {
  if (!secretKey || typeof header !== "string" || !/^[0-9a-f]{128}$/i.test(header)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(header, "hex"));
}

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** What Paystack says about a card it has charged. */
export interface Authorization {
  authorization_code: string;
  /** The physical card: the same card has the same signature under any email. */
  signature?: string;
  reusable?: boolean;
  channel?: string;
}

export interface Transaction {
  status: string;
  reference: string;
  amount: number;
  customer?: { email?: string; customer_code?: string };
  authorization?: Authorization;
  plan?: string | { plan_code?: string } | null;
}

export interface SubscriptionInfo {
  subscription_code: string;
  email_token?: string;
  status?: string;
  next_payment_date?: string | null;
  plan?: { plan_code?: string } | string;
  customer?: { email?: string; customer_code?: string };
}

type Fetch = typeof fetch;

export function paystackClient(config: PaystackConfig = paystackConfig(), fetchImpl: Fetch = (...a) => fetch(...a)) {
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (!config.secretKey) throw new PaystackError("Paystack isn't set up (PAYSTACK_SECRET_KEY)", 503);
    let res: Response;
    try {
      res = await fetchImpl(`${config.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new PaystackError(`Paystack unreachable: ${e instanceof Error ? e.message : String(e)}`, 502);
    }
    let json: { status?: boolean; message?: string; data?: T } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      /* not JSON: the status below says enough */
    }
    if (!res.ok || json.status === false) {
      throw new PaystackError(`Paystack ${method} ${path.split("?")[0]}: ${res.status} ${json.message ?? ""}`.trim(), res.status);
    }
    return json.data as T;
  }

  return {
    initialize: (input: {
      email: string;
      amount: number;
      reference: string;
      callback_url: string;
      plan?: string;
      channels?: string[];
      metadata?: Record<string, unknown>;
    }) =>
      call<{ authorization_url: string; reference: string }>("POST", "/transaction/initialize", {
        ...input,
        currency: "ZAR",
        ...(input.metadata && { metadata: JSON.stringify(input.metadata) }),
      }),
    verify: (reference: string) => call<Transaction>("GET", `/transaction/verify/${encodeURIComponent(reference)}`),
    refund: (reference: string) => call<unknown>("POST", "/refund", { transaction: reference, merchant_note: "Accucery Premium card check" }),
    createSubscription: (input: { customer: string; plan: string; authorization: string; start_date: string }) =>
      call<SubscriptionInfo>("POST", "/subscription", input),
    fetchSubscription: (code: string) => call<SubscriptionInfo>("GET", `/subscription/${encodeURIComponent(code)}`),
    disableSubscription: (code: string, token: string) => call<unknown>("POST", "/subscription/disable", { code, token }),
    manageLink: (code: string) => call<{ link: string }>("GET", `/subscription/${encodeURIComponent(code)}/manage/link`),
  };
}

export type PaystackClient = ReturnType<typeof paystackClient>;
