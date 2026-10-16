import type { OwnerActivity, OwnerCreditDay, OwnerDashboard, OwnerDay, OwnerStore } from "@accucery/types";
import { STORE_CONFIGS } from "@accucery/types";
import { prisma } from "../db.js";
import { DAILY_GUIDE, joburgDay } from "../scraper/credits.js";
import { PRICES_CENTS, type Plan } from "../payments/paystack.js";

// The Owner's dashboard: everything from what the database already holds.
// Nothing here is recorded for it. A shopper is named by the part of their
// email before the @ (the Owner's choice, 2026-10-16), never the whole
// address, and no list's name or contents is ever read.

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = 30;
const ACTIVITY = 50;

// South Africa has one time zone, two hours ahead of UTC all year.
const sastMidnight = (day: string) => new Date(`${day}T00:00:00+02:00`);
const storeName = (slug: string) => STORE_CONFIGS.find((s) => s.slug === slug)?.name ?? slug;
const planPrice = (plan: string) => PRICES_CENTS[plan as Plan] ?? 0;

/** "thandi.m@gmail.com" -> "thandi.m": who it is, like a username, without the address to write to. */
export function username(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** The last `count` South African days, oldest first, ending today. */
export function lastDays(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => joburgDay(new Date(now.getTime() - (count - 1 - i) * DAY_MS)));
}

// Rows per South African day since `from`, for a table with a createdAt.
async function perDay(table: "accounts" | "lists", from: Date): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<{ day: string; n: bigint }[]>(
    `SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD') AS day, count(*) AS n
       FROM ${table} WHERE "createdAt" >= $1 GROUP BY 1`,
    from
  );
  return new Map(rows.map((r) => [r.day, Number(r.n)]));
}

export async function ownerDashboard(now: Date = new Date()): Promise<OwnerDashboard> {
  const today = joburgDay(now);
  const startOfToday = sastMidnight(today);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * DAY_MS);
  const monthStart = `${today.slice(0, 7)}-01`;
  const startOfMonth = sastMidnight(monthStart);
  const days = lastDays(now, DAYS);
  const since30 = sastMidnight(days[0]);

  const [
    accounts,
    newToday,
    newThisWeek,
    newThisMonth,
    pendingSignups,
    signedInDevices,
    devicesWithoutAccount,
    lists,
    items,
    newListsThisWeek,
    listsPerStore,
    accountsPerDay,
    listsPerDay,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.account.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.account.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.pendingSignup.count({ where: { expiresAt: { gt: now } } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    // A list belongs to an Account or to a browser (ADR 0003): owners that
    // aren't an Account are browsers using the app without one.
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(DISTINCT l."userId") AS n FROM lists l
      WHERE l."userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = l."userId")`.then((r) => Number(r[0]?.n ?? 0)),
    prisma.list.count(),
    prisma.listItem.count(),
    prisma.list.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.list.groupBy({ by: ["storeSlug"], _count: { _all: true } }),
    perDay("accounts", since30),
    perDay("lists", since30),
  ]);

  const daily: OwnerDay[] = days.map((day) => ({ day, accounts: accountsPerDay.get(day) ?? 0, lists: listsPerDay.get(day) ?? 0 }));

  // ── Premium ──
  const [subscriptions, checkoutsStarted30d, checkoutsFinished30d, firstPayments, renewals] = await Promise.all([
    prisma.subscription.findMany({ select: { plan: true, accessUntil: true, trialEndsAt: true, cancelled: true } }),
    prisma.premiumCheckout.count({ where: { createdAt: { gte: since30 } } }),
    prisma.premiumCheckout.count({ where: { createdAt: { gte: since30 }, outcome: { in: ["trial-started", "subscribed"] } } }),
    prisma.premiumCheckout.findMany({ where: { handledAt: { gte: startOfMonth }, outcome: "subscribed" }, select: { plan: true } }),
    prisma.premiumCharge.findMany({ where: { createdAt: { gte: startOfMonth } }, select: { account: { select: { subscription: { select: { plan: true } } } } } }),
  ]);
  const running = subscriptions.filter((s) => s.accessUntil && s.accessUntil > now);
  const trialing = running.filter((s) => s.trialEndsAt && s.trialEndsAt > now);
  const paymentPlans = [...firstPayments.map((p) => p.plan), ...renewals.map((r) => r.account.subscription?.plan ?? "")];

  // ── Credits, and each store's searches and prices ──
  const [creditRows, searchesPerStore, pricesPerStore] = await Promise.all([
    // Enough days for both the 30-day chart and this month's total.
    prisma.creditSpend.findMany({ where: { day: { gte: [monthStart, days[0]].sort()[0] } } }),
    prisma.searchCache.groupBy({ by: ["storeSlug"], _count: { _all: true }, _max: { scrapedAt: true } }),
    prisma.priceCache.groupBy({ by: ["storeSlug"], _count: { _all: true } }),
  ]);
  const credits: OwnerCreditDay[] = days.map((day) => {
    const byPurpose: Record<string, number> = {};
    for (const r of creditRows) if (r.day === day) byPurpose[r.purpose] = (byPurpose[r.purpose] ?? 0) + r.count;
    return { day, total: Object.values(byPurpose).reduce((a, b) => a + b, 0), byPurpose };
  });
  const thisMonth = creditRows.filter((r) => r.day >= monthStart).reduce((sum, r) => sum + r.count, 0);

  const slugs = new Set([
    ...STORE_CONFIGS.filter((s) => s.active).map((s) => s.slug),
    ...listsPerStore.map((r) => r.storeSlug),
    ...searchesPerStore.map((r) => r.storeSlug),
  ]);
  const stores: OwnerStore[] = [...slugs].map((store) => {
    const searched = searchesPerStore.find((r) => r.storeSlug === store);
    return {
      store,
      lists: listsPerStore.find((r) => r.storeSlug === store)?._count._all ?? 0,
      searches: searched?._count._all ?? 0,
      prices: pricesPerStore.find((r) => r.storeSlug === store)?._count._all ?? 0,
      lastRead: searched?._max.scrapedAt?.toISOString() ?? null,
    };
  });

  // ── Health ──
  const [alertRows, tables, databaseBytes] = await Promise.all([
    prisma.rememberedValue.findMany({ where: { key: { startsWith: "alert:" } } }),
    prisma.$queryRaw<{ table: string; rows: bigint; bytes: bigint }[]>`
      SELECT relname AS table, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes
      FROM pg_stat_user_tables WHERE relname <> '_prisma_migrations' ORDER BY pg_total_relation_size(relid) DESC`,
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`.then((r) => Number(r[0]?.bytes ?? 0)),
  ]);
  const alerts = alertRows
    .map((r) => ({ key: r.key.slice("alert:".length), level: (r.value as { level?: number }).level ?? 0 }))
    .filter((a) => a.level > 0);

  return {
    asOf: now.toISOString(),
    shoppers: { accounts, newToday, newThisWeek, newThisMonth, pendingSignups, signedInDevices, devicesWithoutAccount },
    lists: { lists, items, newThisWeek: newListsThisWeek },
    daily,
    premium: {
      active: running.length - trialing.length,
      trialing: trialing.length,
      cancelledRunning: running.filter((s) => s.cancelled).length,
      ended: subscriptions.length - running.length,
      checkoutsStarted30d,
      checkoutsFinished30d,
      paymentsThisMonth: paymentPlans.length,
      estimatedIncomeCentsThisMonth: paymentPlans.reduce((sum, plan) => sum + planPrice(plan), 0),
    },
    credits: { dailyGuide: DAILY_GUIDE, thisMonth, days: credits },
    stores,
    alerts,
    tables: tables.map((t) => ({ table: t.table, rows: Number(t.rows), bytes: Number(t.bytes) })),
    databaseBytes,
    activity: await recentActivity(),
  };
}

/** The latest things that happened, from each table's own dates, newest first: up to `limit` of each kind. Deleted things are gone from here too. */
export async function recentActivity(limit = ACTIVITY): Promise<OwnerActivity[]> {
  const take = limit;
  const desc = "desc" as const;
  const [accounts, signups, lists, checkouts, handled, renewals] = await Promise.all([
    prisma.account.findMany({ take, orderBy: { createdAt: desc }, select: { createdAt: true, email: true } }),
    prisma.pendingSignup.findMany({ take, orderBy: { createdAt: desc }, select: { createdAt: true, email: true } }),
    prisma.list.findMany({ take, orderBy: { createdAt: desc }, select: { createdAt: true, storeSlug: true, userId: true } }),
    prisma.premiumCheckout.findMany({ take, orderBy: { createdAt: desc }, select: { createdAt: true, plan: true, purpose: true, account: { select: { email: true } } } }),
    prisma.premiumCheckout.findMany({
      take,
      where: { handledAt: { not: null } },
      orderBy: { handledAt: desc },
      select: { handledAt: true, plan: true, outcome: true, account: { select: { email: true } } },
    }),
    prisma.premiumCharge.findMany({ take, orderBy: { createdAt: desc }, select: { createdAt: true, account: { select: { email: true, subscription: { select: { plan: true } } } } } }),
  ]);

  // Whose each list is, when it's on an Account: a browser without one has no name.
  const listOwners = new Map(
    (await prisma.account.findMany({ where: { id: { in: lists.map((l) => l.userId ?? "") } }, select: { id: true, email: true } })).map(
      (a) => [a.id, username(a.email)]
    )
  );
  const outcomeWords: Record<string, string> = {
    "trial-started": "started a Premium trial",
    subscribed: "subscribed to Premium",
    "trial-used": "was refused a second trial",
    "card-not-reusable": "used a card that can't renew",
  };

  const events: OwnerActivity[] = [
    ...accounts.map((a) => {
      const who = username(a.email);
      return { at: a.createdAt.toISOString(), kind: "account" as const, who, text: `${who} created an account` };
    }),
    ...signups.map((s) => {
      const who = username(s.email);
      return { at: s.createdAt.toISOString(), kind: "signup" as const, who, text: `${who} signed up, waiting to confirm` };
    }),
    ...lists.map((l) => {
      const who = l.userId ? listOwners.get(l.userId) : undefined;
      const at = l.createdAt.toISOString();
      const store = storeName(l.storeSlug);
      return who
        ? { at, kind: "list" as const, who, text: `${who} made a list at ${store}` }
        : { at, kind: "list" as const, text: `A list at ${store}, without an account` };
    }),
    ...checkouts.map((c) => {
      const who = username(c.account.email);
      return { at: c.createdAt.toISOString(), kind: "checkout" as const, who, text: `${who} opened Premium checkout (${c.plan}${c.purpose === "trial" ? ", trial" : ""})` };
    }),
    ...handled.map((c) => {
      const who = username(c.account.email);
      return { at: c.handledAt!.toISOString(), kind: "premium" as const, who, text: `${who} ${outcomeWords[c.outcome ?? ""] ?? "finished checkout"} (${c.plan})` };
    }),
    ...renewals.map((r) => {
      const who = username(r.account.email);
      return { at: r.createdAt.toISOString(), kind: "renewal" as const, who, text: `${who} renewed Premium${r.account.subscription ? ` (${r.account.subscription.plan})` : ""}` };
    }),
  ];
  // Up to `limit` of each kind, so the page's filters (Premium, one shopper)
  // still have a history to show when other kinds are busier.
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
