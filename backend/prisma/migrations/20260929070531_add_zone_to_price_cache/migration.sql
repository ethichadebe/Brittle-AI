/*
  Warnings:

  - The primary key for the `price_cache` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `zone` to the `price_cache` table without a default value.

  This table is a TTL-based cache with nothing else referencing it, and no
  existing row has a real zone value to backfill (the concept didn't exist
  yet) — so rather than invent one, every row is cleared. The next read for
  each product is a cache miss and re-scrapes, same as any expired row would.
*/
-- TruncateTable
TRUNCATE TABLE "price_cache";

-- AlterTable
ALTER TABLE "price_cache" DROP CONSTRAINT "price_cache_pkey",
ADD COLUMN     "zone" TEXT NOT NULL,
ADD CONSTRAINT "price_cache_pkey" PRIMARY KEY ("storeSlug", "productId", "zone");
