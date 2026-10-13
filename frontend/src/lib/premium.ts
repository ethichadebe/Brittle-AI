import type { PremiumOutcome, PremiumPlan, PremiumStatus } from "@accucery/types";
import { formatRand } from "./format";

// The words on the Premium screens (#171), kept here so they can be tested
// without a browser.

export const PLAN_LABEL: Record<PremiumPlan, string> = { monthly: "Monthly", yearly: "Yearly" };

/** "R29 a month" / "R249 a year". */
export function priceLine(plan: PremiumPlan, cents: number): string {
  const rands = formatRand(cents / 100).replace(/[.,]00$/, "");
  return `${rands} a ${plan === "yearly" ? "year" : "month"}`;
}

/** How much a year saves against twelve months, in whole percent. */
export function yearlySaving(prices: Record<PremiumPlan, number>): number {
  return Math.round((1 - prices.yearly / (prices.monthly * 12)) * 100);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

/** The one line that says where this account's Premium stands. */
export function statusLine(s: PremiumStatus): string {
  if (!s.premium || !s.accessUntil) return "";
  if (s.trialing && s.trialEndsAt) {
    return s.cancelled
      ? `Free trial until ${shortDate(s.trialEndsAt)}. Cancelled, so you won't be charged.`
      : `Free trial until ${shortDate(s.trialEndsAt)}, then ${s.plan ? priceLine(s.plan, s.prices[s.plan]) : "the plan's price"}.`;
  }
  return s.cancelled ? `Premium until ${shortDate(s.accessUntil)}. It won't renew.` : `Renews automatically. Paid up until ${shortDate(s.accessUntil)}.`;
}

/** What the return page says after Paystack sends the shopper back. */
export function outcomeMessage(outcome: PremiumOutcome, s: PremiumStatus | null): { title: string; body: string; ok: boolean } {
  switch (outcome) {
    case "trial-started":
      return {
        title: "Your free trial has started",
        body: `You won't be charged until ${s?.trialEndsAt ? shortDate(s.trialEndsAt) : "the trial ends"}. Cancel any time before then in Profile. The card check is being refunded.`,
        ok: true,
      };
    case "subscribed":
      return { title: "Welcome to Premium", body: "Thanks for supporting Accucery. You can manage or cancel it any time in Profile.", ok: true };
    case "trial-used":
      return {
        title: "That card has had a free trial",
        body: "Free trials are one per card, so we've refunded the card check. You can still subscribe without a trial.",
        ok: false,
      };
    case "card-not-reusable":
      return {
        title: "That card can't be used for a subscription",
        body: "Some cards, often prepaid ones, can't be charged again each month. We've refunded the card check. Try another card.",
        ok: false,
      };
    case "pending":
      return s?.premium
        ? { title: "You have Premium", body: statusLine(s), ok: true }
        : { title: "Waiting for Paystack…", body: "Your payment hasn't been confirmed yet. This usually takes a few seconds.", ok: false };
  }
}
