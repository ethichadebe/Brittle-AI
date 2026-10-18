import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { testPrisma } from "../test/testDb.js";

// The one-off clean-up of card prices saved before cardPrice() existed
// (2026-10-18). The test database already has every migration applied, so
// this puts the bad rows back and runs the migration's SQL over them again.
const SQL = readFileSync(
  join(import.meta.dirname, "..", "..", "prisma", "migrations", "20261018120000_clear_impossible_card_prices", "migration.sql"),
  "utf8"
);

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function runMigration() {
  // One statement at a time: Prisma runs a single statement per call.
  const statements = SQL.replace(/^--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const s of statements) await testPrisma.$executeRawUnsafe(s);
}

describe("clearing impossible card prices", () => {
  it("clears R0 and above-regular card prices from the price cache and lists, and keeps real ones", async () => {
    const at = new Date();
    const cache = (productId: string, loyaltyPrice: number | null) =>
      testPrisma.priceCache.create({
        data: { storeSlug: "checkers", productId, productName: productId, imageUrl: "", zone: "z", regularPrice: 16.99, loyaltyPrice, scrapedAt: at },
      });
    await Promise.all([cache("zero", 0), cache("above", 18), cache("same", 16.99), cache("real", 14.99), cache("none", null)]);

    const list = await testPrisma.list.create({ data: { id: randomUUID(), storeSlug: "checkers", name: "Braai" } });
    const item = (productId: string, loyaltyPrice: number | null) =>
      testPrisma.listItem.create({ data: { listId: list.id, productId, productName: productId, imageUrl: "", regularPrice: 16.99, loyaltyPrice } });
    await Promise.all([item("zero", 0), item("above", 18), item("real", 14.99)]);

    await runMigration();

    const cached = Object.fromEntries((await testPrisma.priceCache.findMany()).map((r) => [r.productId, r.loyaltyPrice?.toNumber() ?? null]));
    expect(cached).toEqual({ zero: null, above: null, same: null, real: 14.99, none: null });
    const items = Object.fromEntries((await testPrisma.listItem.findMany()).map((r) => [r.productId, r.loyaltyPrice?.toNumber() ?? null]));
    expect(items).toEqual({ zero: null, above: null, real: 14.99 });
  });
});
