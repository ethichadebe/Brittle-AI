import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { joburgDay } from "../scraper/credits.js";
import type { Comparison } from "./compare.js";

// Data kept for later use (decided with the owner, 2026-10-22). Nothing in the
// app reads it yet. Every write here is best effort: a failure is logged and
// swallowed, so collecting can never break a search, a list or a comparison.
async function quietly(what: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (err) {
    console.error(`[collect] couldn't record ${what}:`, err instanceof Error ? err.message : err);
  }
}

/** A price seen at a store: the day's row for that product, latest price wins. */
export function recordPrice(p: {
  storeSlug: string;
  productId: string;
  zone: string;
  productName: string;
  regularPrice: number;
  loyaltyPrice: number | null;
}, now = new Date()): Promise<void> {
  const day = joburgDay(now);
  const data = { productName: p.productName, regularPrice: p.regularPrice, loyaltyPrice: p.loyaltyPrice, seenAt: now };
  return quietly("a price", () =>
    prisma.priceHistory.upsert({
      where: { storeSlug_productId_zone_day: { storeSlug: p.storeSlug, productId: p.productId, zone: p.zone, day } },
      update: data,
      create: { storeSlug: p.storeSlug, productId: p.productId, zone: p.zone, day, ...data },
    })
  );
}

// Long enough for any real search, short enough that a pasted essay isn't kept.
export const MAX_QUERY = 100;

/** A search a shopper typed. Never who typed it. */
export function recordSearch(s: { storeSlug: string; query: string; resultCount: number; limited?: boolean }): Promise<void> {
  return quietly("a search", () =>
    prisma.searchLog.create({
      data: {
        storeSlug: s.storeSlug,
        query: s.query.trim().toLowerCase().slice(0, MAX_QUERY),
        resultCount: s.resultCount,
        limited: s.limited ?? false,
      },
    })
  );
}

/** A comparison's outcome. Never who compared. */
export function recordComparison(
  fromStore: string,
  toStore: string,
  listItems: { productId: string; productName: string; regularPrice: number; quantity: number }[],
  result: Comparison
): Promise<void> {
  const byProduct = new Map(listItems.map((i) => [i.productId, i]));
  let fromTotal = 0;
  let fromMatchedTotal = 0;
  const items = result.items.map((r) => {
    const own = byProduct.get(r.productId);
    const price = own?.regularPrice ?? 0;
    fromTotal += price * r.quantity;
    if (r.matched) fromMatchedTotal += price * r.quantity;
    return r.matched
      ? {
          productId: r.productId,
          productName: r.productName,
          quantity: r.quantity,
          price,
          matched: true,
          toProductId: r.substitute.productId,
          toProductName: r.substitute.name,
          cost: r.cost,
          source: r.source,
        }
      : { productId: r.productId, productName: r.productName, quantity: r.quantity, price, matched: false, reason: r.reason };
  });
  return quietly("a comparison", () =>
    prisma.compareLog.create({
      data: {
        fromStore,
        toStore,
        itemCount: result.itemCount,
        matchedCount: result.itemCount - result.unmatchedCount,
        fromTotal,
        toTotal: result.total,
        fromMatchedTotal,
        items,
      },
    })
  );
}

// ── Shopping history ──

const MAX_DEVICE_FIELD = 60;

// A client hint arrives as a quoted string: "SM-A546E".
function hint(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const clean = raw?.replace(/^"|"$/g, "").trim();
  return clean ? clean.slice(0, MAX_DEVICE_FIELD) : null;
}

/**
 * What the browser says about the device. The phone model comes only from
 * Chrome's Sec-CH-UA-Model hint, which nginx asks for (Accept-CH); the
 * platform from its Sec-CH-UA-Platform hint, else the User-Agent.
 */
export function deviceOf(headers: FastifyRequest["headers"]): { deviceModel: string | null; platform: string | null } {
  const deviceModel = hint(headers["sec-ch-ua-model"]);
  let platform = hint(headers["sec-ch-ua-platform"]);
  if (!platform) {
    const ua = String(headers["user-agent"] ?? "");
    platform =
      /iPhone/.test(ua) ? "iPhone"
      : /iPad/.test(ua) ? "iPad"
      : /Android/.test(ua) ? "Android"
      : /Windows/.test(ua) ? "Windows"
      : /Mac OS X|Macintosh/.test(ua) ? "macOS"
      : /CrOS/.test(ua) ? "Chrome OS"
      : /Linux/.test(ua) ? "Linux"
      : null;
  }
  return { deviceModel, platform };
}

export async function historyOn(ownerId: string): Promise<boolean> {
  return (await prisma.historyOptOut.findUnique({ where: { ownerId } })) === null;
}

/** An item added to a list or ticked off, unless its owner switched history off. */
export function recordShopping(
  req: FastifyRequest,
  ownerId: string,
  kind: "added" | "ticked",
  e: {
    listId: string;
    storeSlug: string;
    productId: string;
    productName: string;
    regularPrice: number;
    loyaltyPrice: number | null;
    quantity: number;
  }
): Promise<void> {
  const device = deviceOf(req.headers);
  return quietly("shopping history", async () => {
    if (!(await historyOn(ownerId))) return;
    await prisma.shoppingEvent.create({ data: { ownerId, kind, ...e, ...device } });
  });
}

/** Switching history off stops it and deletes what was kept. */
export async function setHistory(ownerId: string, on: boolean): Promise<void> {
  if (on) {
    await prisma.historyOptOut.deleteMany({ where: { ownerId } });
    return;
  }
  await prisma.$transaction([
    prisma.historyOptOut.upsert({ where: { ownerId }, update: {}, create: { ownerId } }),
    prisma.shoppingEvent.deleteMany({ where: { ownerId } }),
  ]);
}

/**
 * A device signing in: its history goes with its lists to the Account. A
 * device that had history switched off switches the Account's off too: the
 * shopper said not to keep it. An Account with it off takes nothing over.
 */
export async function moveHistory(deviceId: string, accountId: string): Promise<void> {
  if (!(await historyOn(deviceId))) return setHistory(accountId, false);
  if (!(await historyOn(accountId))) {
    await prisma.shoppingEvent.deleteMany({ where: { ownerId: deviceId } });
    return;
  }
  await prisma.shoppingEvent.updateMany({ where: { ownerId: deviceId }, data: { ownerId: accountId } });
}

/** An Account deleted: its history and its setting go with it. */
export function forgetHistory(ownerId: string) {
  return [
    prisma.shoppingEvent.deleteMany({ where: { ownerId } }),
    prisma.historyOptOut.deleteMany({ where: { ownerId } }),
  ];
}
