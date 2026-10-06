import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { RememberedStore } from "./remember.js";

// #157: a remembered answer kept in the database, so a restart (every deploy)
// picks it up instead of paying ScraperAPI to find it again.
export function databaseStore<T>(key: string): RememberedStore<T> {
  return {
    async load() {
      const row = await prisma.rememberedValue.findUnique({ where: { key } });
      return row ? { value: row.value as T, savedAt: row.savedAt } : null;
    },
    async save(value) {
      const json = value as Prisma.InputJsonValue;
      const savedAt = new Date();
      await prisma.rememberedValue.upsert({ where: { key }, create: { key, value: json, savedAt }, update: { value: json, savedAt } });
    },
  };
}
