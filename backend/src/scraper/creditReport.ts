import { DAILY_CREDITS, joburgDay } from "./creditBudget.js";

// #157: what the app has spent on ScraperAPI, beside what ScraperAPI itself
// says. Run on the server:
//
//   docker compose -f docker-compose.prod.yml exec backend node dist/scraper/creditReport.js
//
// Prints counts only: never the key.

export interface SpendRow {
  day: string;
  purpose: string;
  count: number;
}

export interface AccountStatus {
  requestCount?: number;
  requestLimit?: number;
}

export function formatReport(rows: SpendRow[], today: string, account: AccountStatus | string | null): string {
  const days = [...new Set(rows.map((r) => r.day))].sort().reverse();
  const lines = [`ScraperAPI credits spent by the app (daily allowance ${DAILY_CREDITS}), newest first:`];
  if (days.length === 0) lines.push("  nothing counted yet");
  for (const day of days) {
    const of = rows.filter((r) => r.day === day);
    const total = of.reduce((n, r) => n + r.count, 0);
    const parts = of
      .sort((a, b) => a.purpose.localeCompare(b.purpose))
      .map((r) => `${r.purpose} ${r.count}`)
      .join(", ");
    lines.push(`  ${day}${day === today ? " (today)" : ""}  ${String(total).padStart(3)}  ${parts}`);
  }
  if (typeof account === "string") lines.push(`ScraperAPI account: couldn't ask (${account})`);
  else if (account) lines.push(`ScraperAPI account: ${account.requestCount ?? "?"} of ${account.requestLimit ?? "?"} credits used this billing month`);
  else lines.push("ScraperAPI account: no SCRAPERAPI_KEY set");
  return lines.join("\n");
}

async function main() {
  const { prisma } = await import("../db.js");
  const since = joburgDay(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
  const rows = await prisma.creditSpend.findMany({ where: { day: { gte: since } } });

  const key = process.env.SCRAPERAPI_KEY;
  let account: AccountStatus | string | null = null;
  if (key) {
    try {
      // Free: asking about the account costs no credit.
      const res = await fetch(`https://api.scraperapi.com/account?api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15000) });
      account = res.ok ? ((await res.json()) as AccountStatus) : `${res.status} ${res.statusText}`;
    } catch (err) {
      account = err instanceof Error ? err.message : String(err);
    }
  }
  console.log(formatReport(rows, joburgDay(), account));
  await prisma.$disconnect();
}

if (process.argv[1]?.endsWith("creditReport.js")) void main();
