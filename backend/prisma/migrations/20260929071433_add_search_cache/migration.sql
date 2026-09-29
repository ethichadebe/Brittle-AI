/*
  Warnings:

  - Added the required column `imageUrl` to the `price_cache` table without a default value.

  Same reasoning as the zone migration just before this one: price_cache is a
  pure TTL cache with nothing else referencing it, so rather than backfill a
  value nobody has, every row is cleared. The next read for each product is
  an ordinary cache miss.
*/
-- TruncateTable
TRUNCATE TABLE "price_cache";

-- AlterTable
ALTER TABLE "price_cache" ADD COLUMN     "imageUrl" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "search_cache" (
    "storeSlug" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "productIds" TEXT[],
    "scrapedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_cache_pkey" PRIMARY KEY ("storeSlug","zone","query")
);
