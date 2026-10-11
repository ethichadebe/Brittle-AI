-- CreateTable
CREATE TABLE "remembered_values" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remembered_values_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "credit_spend" (
    "day" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_spend_pkey" PRIMARY KEY ("day","purpose")
);
