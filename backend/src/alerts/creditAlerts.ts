import type { AccountStatus } from "../scraper/creditReport.js";
import type { Incidents } from "./incidents.js";

// #155: ScraperAPI credits running low. Checkers and Shoprite go through
// ScraperAPI, so at 100% they stop finding prices until the month renews or
// a bigger plan is bought. Warn at 80%, alert at 95%, and say when it renews.

export const WARN_AT = 0.8;
export const ALERT_AT = 0.95;

export function creditLevel(used: number, limit: number): 0 | 1 | 2 {
  if (!(limit > 0)) return 0;
  const share = used / limit;
  return share >= ALERT_AT ? 2 : share >= WARN_AT ? 1 : 0;
}

// "1 000", as the app writes amounts; not toLocaleString, whose spacing differs between machines.
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function creditMessage(level: 0 | 1 | 2, used: number, limit: number): string {
  const pct = Math.floor((used / limit) * 100);
  const count = `${thousands(used)} of ${thousands(limit)} (${pct}%)`;
  if (level === 2) return `🚨 ScraperAPI credits: ${count} used this month. Checkers and Shoprite stop finding prices at 100%. Top up or move to a bigger plan now.`;
  if (level === 1) return `⚠️ ScraperAPI credits: ${count} used this month. Checkers and Shoprite stop finding prices at 100%.`;
  return `✅ ScraperAPI credits are fine again: ${count} used. The month has renewed.`;
}

/** One check. A failed question to ScraperAPI changes nothing: no news isn't bad news here. */
export async function checkCredits(incidents: Incidents, account: () => Promise<AccountStatus | string | null>): Promise<void> {
  const status = await account();
  if (!status || typeof status === "string") return;
  const { requestCount: used, requestLimit: limit } = status;
  if (typeof used !== "number" || typeof limit !== "number") return;
  const level = creditLevel(used, limit);
  await incidents.set("credits", level, creditMessage(level, used, limit));
}
