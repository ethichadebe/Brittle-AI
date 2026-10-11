// ScraperAPI credits, counted (#157). Every request to Checkers or Shoprite
// through ScraperAPI costs one. Nothing is ever refused for want of them
// (decided with the owner: "try again tomorrow" is worse than buying more);
// the count is there so spend can be measured, and a bigger plan bought
// before the month runs out.

/** The stores searched through ScraperAPI: each request to them costs a credit. */
export const CREDIT_STORES: readonly string[] = ["checkers", "shoprite"];

/** A month's free 1,000 credits, spread over the days: a guide in the report, not a limit. */
export const DAILY_GUIDE = 33;

/** What a credit was spent on, so spend can be measured by purpose. */
export type CreditPurpose = "search" | "branch";

/** Where spend is counted. The server keeps it in the database (creditLedger.ts). */
export interface CreditLedger {
  record(day: string, purpose: CreditPurpose): Promise<void>;
}

export function memoryLedger(): CreditLedger & { spent: Map<string, number> } {
  const spent = new Map<string, number>();
  return { spent, record: async (day, purpose) => void spent.set(`${day} ${purpose}`, (spent.get(`${day} ${purpose}`) ?? 0) + 1) };
}

let ledger: CreditLedger = memoryLedger();

/** Set by the server at startup, so counts survive restarts. */
export function keepCreditsIn(next: CreditLedger): void {
  ledger = next;
}

/** "2026-10-06", in Joburg, so a day is a South African day. */
export function joburgDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(now);
}

/** Counts one credit. Never holds a request up: a failed count is only logged. */
export async function countCredit(purpose: CreditPurpose, now: Date = new Date()): Promise<void> {
  try {
    await ledger.record(joburgDay(now), purpose);
  } catch (err) {
    console.error("[credits] could not count a ScraperAPI credit:", err);
  }
}

/** Tests only. */
export function resetCredits(): void {
  ledger = memoryLedger();
}
