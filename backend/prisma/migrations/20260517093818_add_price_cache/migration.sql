-- CreateTable
CREATE TABLE "price_cache" (
    "storeSlug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "regularPrice" DECIMAL(65,30) NOT NULL,
    "loyaltyPrice" DECIMAL(65,30),
    "scrapedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_cache_pkey" PRIMARY KEY ("storeSlug","productId")
);
