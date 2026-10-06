// The daily ScraperAPI allowance (#157, decided with the owner): the free
// plan's 1,000 credits a month, spread evenly, so the month never runs dry
// halfway. Every request to Checkers or Shoprite through ScraperAPI costs a
// credit; past the day's share, none is made until tomorrow (Joburg time).
// Saved prices keep showing, with their age.

export const DAILY_CREDITS = 33;

/** The stores searched through ScraperAPI: each request to them costs a credit. */
export const CREDIT_STORES: readonly string[] = ["checkers", "shoprite"];

/** What a credit was spent on, so spend can be measured by purpose (#157). */
export type CreditPurpose = "search" | "branch";

export class CreditBudgetSpent extends Error {
  constructor() {
    super("Checkers and Shoprite have used today's price checks. Saved prices still show; new searches there work again tomorrow.");
    this.name = "CreditBudgetSpent";
  }
}

/** Where spend is counted. The server keeps it in the database (creditLedger.ts). */
export interface CreditLedger {
  spentOn(day: string): Promise<number>;
  record(day: string, purpose: CreditPurpose): Promise<void>;
}

export function memoryLedger(): CreditLedger {
  const spent = new Map<string, number>();
  return {
    spentOn: async (day) => spent.get(day) ?? 0,
    record: async (day) => void spent.set(day, (spent.get(day) ?? 0) + 1),
  };
}

let ledger: CreditLedger = memoryLedger();

/** Set by the server at startup, so a restart doesn't hand out a fresh day's allowance. */
export function keepCreditsIn(next: CreditLedger): void {
  ledger = next;
}

/** "2026-10-06", in Joburg: the allowance turns over at local midnight. */
export function joburgDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(now);
}

/** Spends one credit, or throws CreditBudgetSpent when today's are gone. */
export async function spendCredit(purpose: CreditPurpose, now: Date = new Date()): Promise<void> {
  const day = joburgDay(now);
  if ((await ledger.spentOn(day)) >= DAILY_CREDITS) throw new CreditBudgetSpent();
  await ledger.record(day, purpose);
}

/** Tests only. */
export function resetCredits(): void {
  ledger = memoryLedger();
}
