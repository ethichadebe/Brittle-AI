-- CreateTable
CREATE TABLE "price_history" (
    "storeSlug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "regularPrice" DECIMAL(65,30) NOT NULL,
    "loyaltyPrice" DECIMAL(65,30),
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("storeSlug","productId","zone","day")
);

-- CreateTable
CREATE TABLE "search_log" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeSlug" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "limited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "search_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compare_log" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromStore" TEXT NOT NULL,
    "toStore" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "matchedCount" INTEGER NOT NULL,
    "fromTotal" DECIMAL(65,30) NOT NULL,
    "toTotal" DECIMAL(65,30) NOT NULL,
    "fromMatchedTotal" DECIMAL(65,30) NOT NULL,
    "items" JSONB NOT NULL,

    CONSTRAINT "compare_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_events" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "regularPrice" DECIMAL(65,30) NOT NULL,
    "loyaltyPrice" DECIMAL(65,30),
    "quantity" INTEGER NOT NULL,
    "deviceModel" TEXT,
    "platform" TEXT,

    CONSTRAINT "shopping_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_opt_outs" (
    "ownerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_opt_outs_pkey" PRIMARY KEY ("ownerId")
);

-- CreateIndex
CREATE INDEX "price_history_storeSlug_productId_idx" ON "price_history"("storeSlug", "productId");

-- CreateIndex
CREATE INDEX "search_log_at_idx" ON "search_log"("at");

-- CreateIndex
CREATE INDEX "compare_log_at_idx" ON "compare_log"("at");

-- CreateIndex
CREATE INDEX "shopping_events_ownerId_at_idx" ON "shopping_events"("ownerId", "at");

